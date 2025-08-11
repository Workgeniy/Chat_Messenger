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
    public ChatsController(AppDbContext db) { _db = db; }

    [HttpGet]
    public async Task<IActionResult> My()
    {
        var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var items = await _db.ChatUsers
            .AsNoTracking()
            .Where(cu => cu.UserId == me)
            .Select(cu => new
            {
                ChatId = cu.ChatId,
                ChatName = cu.Chat.Name,
                // подтянем участников
                Members = cu.Chat.ChatUsers.Select(x => new { x.User.Id, x.User.Name, x.User.AvatarUrl })
            })
            .ToListAsync();

        var result = items.Select(x =>
        {
            var members = x.Members.ToList();
            var isGroup = members.Count != 2;
            string title;
            string? avatar = null;

            if (isGroup)
            {
                title = x.ChatName ?? "Группа";
                // при желании: групповой аватар из Chat.AvatarUrl
            }
            else
            {
                var peer = members.First(m => m.Id != me);
                title = peer.Name ?? $"User#{peer.Id}";
                avatar = peer.AvatarUrl;
            }

            return new
            {
                id = x.ChatId,
                title,
                avatarUrl = avatar,
                isGroup
            };
        });

        return Ok(result);
    }
}

