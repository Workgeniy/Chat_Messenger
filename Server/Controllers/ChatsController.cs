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
}

