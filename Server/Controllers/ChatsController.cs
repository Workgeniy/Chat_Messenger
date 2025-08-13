using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Services;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChatsController(AppDbContext db) { _db = db; }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> My([FromServices] IPresenceService presence)
    {
        var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var items = await _db.ChatUsers
            .AsNoTracking()
            .Where(cu => cu.UserId == me)
            .Select(cu => new
            {
                cu.Chat.Id,
                cu.Chat.Name,
                Members = cu.Chat.ChatUsers.Select(x => new { x.User.Id, x.User.Name, x.User.AvatarUrl, x.User.LastSeenUtc })
            })
            .ToListAsync();

        var result = items.Select(x =>
        {
            var members = x.Members.ToList();
            var isGroup = members.Count != 2;
            string title;
            string? avatar = null;
            bool? isOnline = null;
            DateTime? lastSeenUtc = null;

            if (isGroup)
            {
                title = x.Name ?? "Группа";
            }
            else
            {
                var peer = members.First(m => m.Id != me);
                title = peer.Name ?? $"User#{peer.Id}";
                avatar = peer.AvatarUrl;
                isOnline = presence.IsOnline(peer.Id);
                lastSeenUtc = peer.LastSeenUtc;
            }

            return new
            {
                id = x.Id,
                title,
                avatarUrl = avatar,
                isGroup,
                isOnline,
                lastSeenUtc
            };
        });

        return Ok(result);
    }

    [Authorize]
    [HttpPost("startWith/{peerId:int}")]
    public async Task<IActionResult> StartWith(int peerId)
    {
        var me = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        if (me == peerId) return BadRequest("Нельзя начать диалог с самим собой");

        // есть ли уже диалог 1-на-1?
        var chatId = await _db.ChatUsers
            .Where(cu => cu.UserId == me)
            .Select(cu => cu.ChatId)
            .Intersect(
                _db.ChatUsers.Where(cu => cu.UserId == peerId).Select(cu => cu.ChatId)
            )
            .Where(cid => _db.Chats.Any(c => c.Id == cid && !c.IsGroup)) // если у тебя есть флаг IsGroup
            .Cast<int?>()
            .FirstOrDefaultAsync();

        if (chatId is null)
        {
            var chat = new Chat { Name = null /* для 1:1 можно null */, IsGroup = false };
            _db.Chats.Add(chat);
            await _db.SaveChangesAsync();

            _db.ChatUsers.AddRange(
                new ChatUser { ChatId = chat.Id, UserId = me, IsAdmin = false, Created = DateTime.UtcNow },
                new ChatUser { ChatId = chat.Id, UserId = peerId, IsAdmin = false, Created = DateTime.UtcNow }
            );
            await _db.SaveChangesAsync();
            chatId = chat.Id;
        }

        // вернём карточку чата (title = имя peer)
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

