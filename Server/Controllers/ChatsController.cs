using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChatsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> MyChats()
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var chats = await _db.ChatUsers
            .Where(cu => cu.UserId == userId)
            .Select(cu => new
            {
                id = cu.Chat.Id,
                title = cu.Chat.IsGroup
                    ? cu.Chat.Name
                    : cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => x.User.Name).FirstOrDefault(),
                avatarUrl = cu.Chat.IsGroup
                    ? cu.Chat.AvatarUrl
                    : cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => x.User.AvatarUrl).FirstOrDefault(),
                isGroup = cu.Chat.IsGroup,

                // если нет текста, но есть вложения — показываем «Вложение»
                lastText = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => string.IsNullOrEmpty(m.Content)
                        ? (m.Attachments.Any() ? "Вложение" : null)
                        : m.Content)
                    .FirstOrDefault(),
                lastUtc = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => (DateTime?)m.Sent)
                    .FirstOrDefault(),
                lastSenderId = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => (int?)m.SenderId)
                    .FirstOrDefault(),

                // поля для онлайна ровно как ждёт фронт
                isOnline = !cu.Chat.IsGroup
                    ? cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => x.User.IsOnline).FirstOrDefault()
                    : (bool?)null,
                lastSeenUtc = !cu.Chat.IsGroup
                    ? cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => (DateTime?)x.User.LastSeenUtc).FirstOrDefault()
                    : (DateTime?)null
            })
            .OrderByDescending(x => x.lastUtc)
            .ToListAsync();

        return Ok(chats);
    }

    [HttpPost("startWith/{peerId:int}")]
    public async Task<IActionResult> StartWith(int peerId)
    {
        var me = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        if (me == peerId) return BadRequest("Нельзя начать диалог с самим собой");

        // ищем уже существующий 1:1
        var chatId = await _db.ChatUsers.Where(cu => cu.UserId == me).Select(cu => cu.ChatId)
            .Intersect(_db.ChatUsers.Where(cu => cu.UserId == peerId).Select(cu => cu.ChatId))
            .Where(cid => _db.Chats.Any(c => c.Id == cid && !c.IsGroup))
            .Cast<int?>()
            .FirstOrDefaultAsync();

        if (chatId is null)
        {
            var chat = new Chat { Name = null, IsGroup = false };
            _db.Chats.Add(chat);
            await _db.SaveChangesAsync();

            _db.ChatUsers.AddRange(
                new ChatUser { ChatId = chat.Id, UserId = me, Created = DateTime.UtcNow },
                new ChatUser { ChatId = chat.Id, UserId = peerId, Created = DateTime.UtcNow }
            );
            await _db.SaveChangesAsync();
            chatId = chat.Id;
        }

        var peer = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == peerId);
        return Ok(new
        {
            id = chatId.Value,
            title = peer.Name ?? $"User#{peer.Id}",
            avatarUrl = peer.AvatarUrl,
            isGroup = false
        });
    }

    public record CreateChatDto(string name, List<int> memberIds, string? avatarUrl);

    [HttpPost("create")]
    public async Task<IActionResult> Create([FromBody] CreateChatDto dto)
    {
        var me = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var chat = new Chat { Name = dto.name, IsGroup = true, AvatarUrl = dto.avatarUrl };
        _db.Chats.Add(chat);
        await _db.SaveChangesAsync();

        var ids = dto.memberIds.Distinct().Where(id => id != me).ToList();
        var members = ids.Append(me).Distinct().ToList();

        _db.ChatUsers.AddRange(members.Select(uid => new ChatUser
        {
            ChatId = chat.Id,
            UserId = uid,
            IsAdmin = uid == me,
            Created = DateTime.UtcNow
        }));
        await _db.SaveChangesAsync();

        return Ok(new { id = chat.Id, title = chat.Name, avatarUrl = chat.AvatarUrl, isGroup = true });
    }

    [HttpGet("{chatId:int}/members")]
    public async Task<IActionResult> GetMembers(int chatId)
    {
        var members = await _db.ChatUsers
            .Where(x => x.ChatId == chatId)
            .Select(x => new {
                id = x.UserId,
                name = x.User!.Name,
                avatarUrl = x.User.AvatarUrl,
                isAdmin = x.IsAdmin,
                lastSeenMessageId = x.LastSeenMessageId        // ← добавили
            })
            .ToListAsync();

        return Ok(members);
    }


    [HttpPost("{chatId:int}/leave")]
    public async Task<IActionResult> Leave(int chatId)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var chatUser = await _db.ChatUsers.FindAsync(chatId, userId);
        if (chatUser == null) return NotFound();

        _db.ChatUsers.Remove(chatUser);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    public record SeenDto(int upToMessageId);

    [HttpPost("{chatId:int}/seen")]
    public async Task<IActionResult> Seen(int chatId, [FromBody] SeenDto dto,
        [FromServices] IHubContext<ChatHub> hub)
    {
        var uid = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        var cu = await _db.ChatUsers.FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == uid);
        if (cu == null) return Forbid();

        var newId = cu.LastSeenMessageId.HasValue
            ? Math.Max(cu.LastSeenMessageId.Value, dto.upToMessageId)
            : dto.upToMessageId;

        cu.LastSeenMessageId = newId;
        cu.LastSeenUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // уведомим остальных
        await hub.Clients.Group($"chat:{chatId}")
            .SendAsync("SeenUpdated", new { chatId, userId = uid, lastSeenMessageId = newId });

        return NoContent();
    }


}
