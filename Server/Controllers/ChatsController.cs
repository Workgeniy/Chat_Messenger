using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using Server.Services;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IPresenceService _presence;

    public ChatsController(AppDbContext db, IHubContext<ChatHub> hub, IPresenceService presence)
    {
        _db = db; _hub = hub; _presence = presence;
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> MyChats()
    {
        var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var items = await _db.Chats
            .AsNoTracking()
            .Where(c => c.ChatUsers.Any(u => u.UserId == me))
            .Select(c => new
            {
                c.Id,
                c.IsGroup,
                Title = c.IsGroup
                    ? c.Name
                    : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.User!.Name).FirstOrDefault(),
                AvatarUrl = c.IsGroup
                    ? c.AvatarUrl
                    : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.User!.AvatarUrl).FirstOrDefault(),

                OpponentId = c.IsGroup ? (int?)null
                    : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.UserId).FirstOrDefault(),

                IsOnline = c.IsGroup ? (bool?)null
                    : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.User!.IsOnline).FirstOrDefault(),
                LastSeenUtc = c.IsGroup ? (DateTime?)null
                    : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.User!.LastSeenUtc).FirstOrDefault(),

                LastMessage = c.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => new { m.Id, m.Sent, m.SenderId, m.Content })
                    .FirstOrDefault(),

                // мой lastSeenId (0 если null)
                MyLastSeenId = c.ChatUsers.Where(x => x.UserId == me)
                                          .Select(x => (int?)x.LastSeenMessageId)
                                          .FirstOrDefault() ?? 0,

                // Непрочитанные = сообщения после моего lastSeen и не мои
                UnreadCount = c.Messages.Count(m => m.Id >
                                 (c.ChatUsers.Where(x => x.UserId == me)
                                             .Select(x => (int?)x.LastSeenMessageId)
                                             .FirstOrDefault() ?? 0)
                               && m.SenderId != me)
            })
            .OrderByDescending(x => x.LastMessage!.Sent)
            .ToListAsync();

        var result = items.Select(x => new
        {
            id = x.Id,
            title = x.Title ?? "Диалог",
            isGroup = x.IsGroup,
            avatarUrl = x.AvatarUrl,
            lastText = x.LastMessage?.Content,
            lastUtc = x.LastMessage?.Sent,
            lastSenderId = x.LastMessage?.SenderId,
            opponentId = x.OpponentId,
            isOnline = x.IsOnline,
            lastSeenUtc = x.LastSeenUtc,
            unreadCount = x.UnreadCount
        });

        return Ok(result);
    }



    [HttpPost("startWith/{peerId:int}")]
    public async Task<IActionResult> StartWith(int peerId)
    {
        var me = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        if (me == peerId) return BadRequest("Нельзя начать диалог с самим собой");

        var chatId = await _db.ChatUsers.Where(cu => cu.UserId == me).Select(cu => cu.ChatId)
            .Intersect(_db.ChatUsers.Where(cu => cu.UserId == peerId).Select(cu => cu.ChatId))
            .Where(cid => _db.Chats.Any(c => c.Id == cid && !c.IsGroup))
            .Cast<int?>()
            .FirstOrDefaultAsync();

        var createdNow = false;
        if (chatId is null)
        {
            var chat = new Chat { Name = null, IsGroup = false, Created = DateTime.UtcNow };
            _db.Chats.Add(chat);
            await _db.SaveChangesAsync();

            var maxId = 0; // только что созданный чат
            _db.ChatUsers.AddRange(
                new ChatUser { ChatId = chat.Id, UserId = me, Created = DateTime.UtcNow, LastSeenMessageId = maxId },
                new ChatUser { ChatId = chat.Id, UserId = peerId, Created = DateTime.UtcNow, LastSeenMessageId = maxId }
            );
            await _db.SaveChangesAsync();

            chatId = chat.Id;
            createdNow = true;

            // Подключим активные соединения адресата к группе чата
            foreach (var conn in _presence.GetConnections(peerId))
                await _hub.Groups.AddToGroupAsync(conn, $"chat:{chat.Id}");

            // Данные для карточки у адресата: соперник — инициатор (me)
            var meUser = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == me);

            await _hub.Clients.Group($"user:{peerId}").SendAsync("ChatCreated", new
            {
                id = chat.Id,
                title = meUser.Name ?? $"User#{meUser.Id}",
                avatarUrl = meUser.AvatarUrl,
                isGroup = false,
                opponentId = me,                    // ← важно для presence
                isOnline = meUser.IsOnline,         // снимок
                lastSeenUtc = meUser.LastSeenUtc,
                lastText = (string?)null,
                lastUtc = (DateTime?)null,
                lastSenderId = (int?)null,
                unreadCount = 0
            });
        }

        var peer = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == peerId);
        return Ok(new
        {
            id = chatId!.Value,
            title = peer.Name ?? $"User#{peer.Id}",
            avatarUrl = peer.AvatarUrl,
            isGroup = false,
            opponentId = peerId
        });
    }


public record CreateChatDto(string name, List<int> memberIds, string? avatarUrl);

    [HttpPost("create")]
    public async Task<IActionResult> Create([FromBody] CreateChatDto dto)
    {
        var me = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var chat = new Chat { Name = dto.name, IsGroup = true, AvatarUrl = dto.avatarUrl, Created = DateTime.UtcNow };
        _db.Chats.Add(chat);
        await _db.SaveChangesAsync();

        var ids = dto.memberIds.Distinct().Where(id => id != me).ToList();
        var members = ids.Append(me).Distinct().ToList();

        // перед добавлением участников узнаём текущий maxId (обычно 0 для только что созданного)
        var maxId = await _db.Messages.Where(m => m.ChatId == chat.Id)
                                      .MaxAsync(m => (int?)m.Id) ?? 0;

        _db.ChatUsers.AddRange(members.Select(uid => new ChatUser
        {
            ChatId = chat.Id,
            UserId = uid,
            IsAdmin = uid == me,
            Created = DateTime.UtcNow,
            LastSeenMessageId = maxId
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
