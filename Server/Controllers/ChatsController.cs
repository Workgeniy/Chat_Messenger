using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using Server.Services;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
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
    private readonly IWebHostEnvironment _env;

    public ChatsController(AppDbContext db, IHubContext<ChatHub> hub, IPresenceService presence, IWebHostEnvironment env)
    {
        _db = db; _hub = hub; _presence = presence;
        _env = env;
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> MyChats()
    {
        var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var items = await _db.Chats
         .AsNoTracking()
         .Where(c => c.ChatUsers.Any(u => u.UserId == me))
         .Select(c => new {
             c.Id,
             c.IsGroup,
             Title = c.IsGroup ? c.Name
                               : c.ChatUsers.Where(x => x.UserId != me).Select(x => x.User!.Name).FirstOrDefault(),
             AvatarUrl = c.IsGroup ? c.AvatarUrl
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

             MyLastSeenId = c.ChatUsers.Where(x => x.UserId == me)
                                       .Select(x => (int?)x.LastSeenMessageId).FirstOrDefault() ?? 0,
             UnreadCount = c.Messages.Count(m =>
                 m.Id > (c.ChatUsers.Where(x => x.UserId == me).Select(x => (int?)x.LastSeenMessageId).FirstOrDefault() ?? 0)
                 && m.SenderId != me)
         })
         .ToListAsync();

        var result = items
            .OrderByDescending(x => x.LastMessage?.Sent ?? DateTime.MinValue) // ← безопасно
            .Select(x => new {
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
                opponentId = me,                    
                isOnline = meUser.IsOnline,         
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
                lastSeenMessageId = x.LastSeenMessageId      
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

    [Authorize]
    [HttpPost("{chatId:int}/avatar")]
    public async Task<IActionResult> UploadChatAvatar(int chatId, [FromForm] IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest("Файл не передан");

        var uid = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var cu = await _db.ChatUsers.AsNoTracking().FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == uid);
        if (cu == null) return Forbid();

        var chat = await _db.Chats.FirstOrDefaultAsync(c => c.Id == chatId);
        if (chat == null || !chat.IsGroup) return NotFound();

        // базовая «прожарка» изображения
        using var image = await Image.LoadAsync(file.OpenReadStream());
        image.Mutate(x => x.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(512, 512) }));

        Directory.CreateDirectory(Path.Combine(_env.WebRootPath, "avatars"));
        var fileName = $"chat_{chatId}_{Guid.NewGuid():N}.jpg";
        var path = Path.Combine(_env.WebRootPath, "avatars", fileName);
        await image.SaveAsJpegAsync(path, new JpegEncoder { Quality = 85 });

        chat.AvatarUrl = $"/avatars/{fileName}";
        await _db.SaveChangesAsync();

        // оповестим участников, чтобы у всех обновилось сразу
        await _hub.Clients.Group($"chat:{chatId}").SendAsync("ChatUpdated", new { id = chatId, avatarUrl = chat.AvatarUrl });

        return Ok(new { avatarUrl = chat.AvatarUrl });
    }

    public record AddMembersDto(List<int> userIds);

    [HttpPost("{chatId:int}/members")]
    public async Task<IActionResult> AddMembers(int chatId, [FromBody] AddMembersDto dto)
    {
        var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var chat = await _db.Chats
            .Include(c => c.ChatUsers)
            .FirstOrDefaultAsync(c => c.Id == chatId && c.IsGroup);
        if (chat is null) return NotFound();

        var meCU = chat.ChatUsers.FirstOrDefault(x => x.UserId == me);
        if (meCU is null) return Forbid();


        var toAdd = dto.userIds
            .Distinct()
            .Where(uid => uid != me && !chat.ChatUsers.Any(cu => cu.UserId == uid))
            .ToList();
        if (toAdd.Count == 0) return Ok(new { added = 0 });

        var maxId = await _db.Messages.Where(m => m.ChatId == chatId)
                                      .MaxAsync(m => (int?)m.Id) ?? 0;

        foreach (var uid in toAdd)
            _db.ChatUsers.Add(new ChatUser
            {
                ChatId = chatId,
                UserId = uid,
                IsAdmin = false,
                Created = DateTime.UtcNow,
                LastSeenMessageId = maxId
            });

        await _db.SaveChangesAsync();

        // подключим активные соединения новых участников к группе SignalR
        foreach (var uid in toAdd)
            foreach (var conn in _presence.GetConnections(uid))
                await _hub.Groups.AddToGroupAsync(conn, $"chat:{chatId}");

        // чтобы чат появился у приглашённых в списке
        foreach (var uid in toAdd)
            await _hub.Clients.Group($"user:{uid}").SendAsync("ChatCreated", new
            {
                id = chatId,
                title = chat.Name,
                avatarUrl = chat.AvatarUrl,
                isGroup = true,
                opponentId = (int?)null,
                isOnline = (bool?)null,
                lastSeenUtc = (DateTime?)null,
                lastText = (string?)null,
                lastUtc = (DateTime?)null,
                lastSenderId = (int?)null,
                unreadCount = 0
            });

        // уведомим текущих участников — можно обновить список участников на клиенте
        await _hub.Clients.Group($"chat:{chatId}")
            .SendAsync("MembersAdded", new { chatId, userIds = toAdd });

        return Ok(new { added = toAdd.Count });
    }


    [HttpDelete("{chatId:int}/members/{userId:int}")]
    public async Task<IActionResult> RemoveMember(int chatId, int userId)
    {
        var meId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var chat = await _db.Chats
            .Include(c => c.ChatUsers)
            .FirstOrDefaultAsync(c => c.Id == chatId && c.IsGroup);
        if (chat == null) return NotFound();

        var me = chat.ChatUsers.FirstOrDefault(m => m.UserId == meId);
        if (me == null) return Forbid();
        if (!me.IsAdmin) return Forbid();                    

        var target = chat.ChatUsers.FirstOrDefault(m => m.UserId == userId);
        if (target == null) return NotFound();
        if (target.IsAdmin) return StatusCode(403, "Нельзя исключить администратора");

        _db.ChatUsers.Remove(target);
        await _db.SaveChangesAsync();

        await _hub.Clients.Group($"chat:{chatId}")          
            .SendAsync("MemberRemoved", new { chatId, userId });

        return Ok(new { removed = userId });
    }






}
