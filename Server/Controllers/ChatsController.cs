using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChatsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetMyChats()
    {
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        // Если в Chat поле называется Name — маппим его в Title
        var chats = await _db.ChatUsers
            .AsNoTracking()
            .Include(cu => cu.Chat)
            .Where(cu => cu.UserId == userId)
            .Select(cu => new
            {
                id = cu.Chat.Id,
                title = cu.Chat.Name,
                unread = 0
            })
            .ToListAsync();

        return Ok(chats);
    }
}
