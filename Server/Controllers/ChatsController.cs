using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChatsController(AppDbContext db) => _db = db;

    // GET /api/chats
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
                        .Select(x => x.User.Name)
                        .FirstOrDefault(),
                avatarUrl = cu.Chat.IsGroup
                    ? cu.Chat.AvatarUrl
                    : cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => x.User.AvatarUrl)
                        .FirstOrDefault(),
                isGroup = cu.Chat.IsGroup,

                lastText = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => m.Content)
                    .FirstOrDefault(),
                lastUtc = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => (DateTime?)m.Sent)
                    .FirstOrDefault(),
                lastSenderId = cu.Chat.Messages
                    .OrderByDescending(m => m.Sent)
                    .Select(m => (int?)m.SenderId)
                    .FirstOrDefault(),

                // индикатор онлайна/last seen — только для 1:1
                isOnline = !cu.Chat.IsGroup
                    ? cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => x.User.IsOnline)
                        .FirstOrDefault()
                    : (bool?)null,
                lastSeenUtc = !cu.Chat.IsGroup
                    ? cu.Chat.ChatUsers.Where(x => x.UserId != userId)
                        .Select(x => (DateTime?)x.User.LastSeenUtc)
                        .FirstOrDefault()
                    : (DateTime?)null
            })
            .OrderByDescending(x => x.lastUtc)
            .ToListAsync();

        return Ok(chats);
    }

    // POST /api/chats/startWith/123
    [HttpPost("startWith/{peerId:int}")]
    public async Task<IActionResult> StartWith(int peerId)
    {
        var me = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        if (me == peerId) return BadRequest("Нельзя начать диалог с самим собой");

        // ищем существующий 1:1
        var chatId = await _db.ChatUsers
            .Where(cu => cu.UserId == me)
            .Select(cu => cu.ChatId)
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
                new ChatUser { ChatId = chat.Id, UserId = me, IsAdmin = false, Created = DateTime.UtcNow },
                new ChatUser { ChatId = chat.Id, UserId = peerId, IsAdmin = false, Created = DateTime.UtcNow }
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
}
