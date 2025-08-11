using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using System.Linq;
using Core.DTO;

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
        var q = _db.Messages
            .AsNoTracking()
            .Where(m => m.ChatId == chatId);

        if (before.HasValue)
            q = q.Where(m => m.Sent < before.Value);

        var list = await q
            .OrderByDescending(m => m.Sent)
            .Take(take)
            .OrderBy(m => m.Sent) // вернуть по возрастанию
            .Select(m => new
            {
                id = m.Id,
                chatId = m.ChatId,
                text = m.Content,
                senderId = m.SenderId,
                sentUtc = DateTime.SpecifyKind(m.Sent, DateTimeKind.Utc),
                attachments = m.Attachments.Select(a => new
                {
                    id = a.Id,
                    url = $"/api/attachments/{a.Id}",
                    contentType = a.MimeType
                }).ToList()
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

        // привязать загруженные вложения к сообщению
        if (dto.Attachments?.Any() == true)
        {
            var atts = await _db.Attachments
                .Where(a => dto.Attachments.Contains(a.Id))
                .ToListAsync();

            foreach (var a in atts) a.MessageId = msg.Id;
            await _db.SaveChangesAsync();
        }

        // собрать payload ровно в том формате, который ждёт фронт
        var attachments = await _db.Attachments
            .Where(a => a.MessageId == msg.Id)
            .Select(a => new
            {
                id = a.Id,
                url = $"/api/attachments/{a.Id}",
                contentType = a.MimeType,
                // если делаешь варианты:
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

}
