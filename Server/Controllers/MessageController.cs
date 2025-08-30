using Core.DTO;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using System.Linq;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MessagesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<ChatHub> _hub;

    public MessagesController(AppDbContext db, IHubContext<ChatHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [Authorize]

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int chatId, [FromQuery] DateTime? before, [FromQuery] int take = 50)
    {
        var q = _db.Messages.AsNoTracking().Where(m => m.ChatId == chatId);
        if (before.HasValue) q = q.Where(m => m.Sent < before.Value);

        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var list = await q
            .OrderByDescending(m => m.Sent)
            .Take(take)
            .OrderBy(m => m.Sent)
           .Select(m => new
           {
               id = m.Id,
               chatId = m.ChatId,
               text = m.IsDeleted ? null : m.Content, 
               isDeleted = m.IsDeleted,               
               senderId = m.SenderId,
               sentUtc = m.Sent,
               editedUtc = m.EditedUtc,
               attachments = m.Attachments.Select(a => new {
                   id = a.Id,
                   url = $"/api/attachments/{a.Id}",  
                   contentType = a.MimeType
               }),
               reactions = m.Reactions
        .GroupBy(r => r.Emoji)
        .Select(g => new {
            emoji = g.Key,
            count = g.Count(),
            mine = g.Any(r => r.UserId == userId)
        })
           })
            .ToListAsync();

        return Ok(list);
    }


    [HttpPost]
    public async Task<IActionResult> Post([FromBody] SendMessageDto dto)
    {
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        var msg = new Message
        {
            ChatId = dto.ChatId,
            SenderId = userId,
            Content = dto.Text,
            Sent = DateTime.UtcNow
        };
        _db.Messages.Add(msg);
        await _db.SaveChangesAsync();

        if (dto.Attachments?.Any() == true)
        {
            var atts = await _db.Attachments
                .Where(a => dto.Attachments.Contains(a.Id))
                .ToListAsync();

            foreach (var a in atts) a.MessageId = msg.Id;
            await _db.SaveChangesAsync();
        }

        var attachments = await _db.Attachments
            .Where(a => a.MessageId == msg.Id)
            .Select(a => new
            {
                id = a.Id,
                url = $"/api/attachments/{a.Id}",
                contentType = a.MimeType,
                thumb = a.Variants.Where(v => v.Type == "thumb")
                                  .Select(v => $"/api/attachments/{a.Id}/thumb")
                                  .FirstOrDefault(),
                hls = a.Variants.Where(v => v.Type == "hls")
                                .Select(v => $"/api/attachments/{a.Id}/hls")
                                .FirstOrDefault()
            })
            .ToListAsync();

        var payload = new
        {
            id = msg.Id,
            chatId = msg.ChatId,
            text = msg.Content,
            senderId = msg.SenderId,
            sentUtc = DateTime.SpecifyKind(msg.Sent, DateTimeKind.Utc),
            attachments
        };

        await _hub.Clients.Group($"chat:{dto.ChatId}")
            .SendAsync("MessageCreated", payload);

        return Ok(payload);
    }

    [HttpPatch("{id:int}")]
    public async Task<IActionResult> EditMessage(int id, [FromBody] EditDto dto)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var m = await _db.Messages.FirstOrDefaultAsync(x => x.Id == id);
        if (m == null) return NotFound();
        if (m.SenderId != userId) return Forbid();

        m.Content = dto.text ?? "";
        m.EditedUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _hub.Clients.Group($"chat:{m.ChatId}").SendAsync("MessageEdited", new
        {
            id = m.Id,
            chatId = m.ChatId,
            text = m.Content,
            editedUtc = m.EditedUtc
        });
        return NoContent();
    }

    public record EditDto(string text);

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteMessage(int id)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var m = await _db.Messages.FirstOrDefaultAsync(x => x.Id == id);
        if (m == null) return NotFound();
        if (m.SenderId != userId) return Forbid();

        m.IsDeleted = true;
        m.Content = "";        
        m.EditedUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _hub.Clients.Group($"chat:{m.ChatId}").SendAsync("MessageDeleted", new { id = m.Id, chatId = m.ChatId });
        return NoContent();
    }

    [HttpPost("{id:int}/react")]
    public async Task<IActionResult> React(int id, [FromBody] ReactDto dto)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var msg = await _db.Messages.FindAsync(id);
        if (msg == null) return NotFound();
        if (msg.IsDeleted) return BadRequest("Нельзя ставить реакцию на удалённое сообщение."); // <--

        var exists = await _db.MessageReactions.FindAsync(id, userId, dto.Emoji);
        if (exists == null)
        {
            _db.MessageReactions.Add(new MessageReaction
            {
                MessageId = id,
                UserId = userId,
                Emoji = dto.Emoji,
                CreatedUtc = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();

            await _hub.Clients.Group($"chat:{msg.ChatId}")
                .SendAsync("ReactionAdded", new { messageId = id, userId, emoji = dto.Emoji });
        }

        return NoContent();
    }

    [HttpDelete("{id:int}/react")]
    public async Task<IActionResult> Unreact(int id, [FromQuery] string emoji)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var msg = await _db.Messages.FindAsync(id);
        if (msg == null) return NotFound();

        var rx = await _db.MessageReactions.FindAsync(id, userId, emoji);
        if (rx != null)
        {
            _db.MessageReactions.Remove(rx);
            await _db.SaveChangesAsync();

            await _hub.Clients.Group($"chat:{msg.ChatId}")
                .SendAsync("ReactionRemoved", new { messageId = id, userId, emoji });
        }
        return NoContent();
    }


    [HttpDelete("{id:int}/react/{emoji}")]
    public async Task<IActionResult> RemoveReact(int id, string emoji)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var rx = await _db.MessageReactions.FindAsync(id, userId, emoji);
        if (rx != null)
        {
            _db.MessageReactions.Remove(rx);
            await _db.SaveChangesAsync();

            var chatId = await _db.Messages.Where(m => m.Id == id)
                                           .Select(m => m.ChatId).FirstAsync();

            await _hub.Clients.Group($"chat:{chatId}")
                .SendAsync("ReactionRemoved", new { messageId = id, userId, emoji }); // 👈
        }
        return NoContent();
    }



}
