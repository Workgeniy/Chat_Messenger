using Core.DTO;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
using System.Security.Claims;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public UsersController(AppDbContext db, IWebHostEnvironment env) { _db = db; _env = env; }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
        if (u == null) return NotFound();
        return Ok(new { id = u.Id, name = u.Name, email = u.Email, avatarUrl = u.AvatarUrl });
    }

    public class UpdateUserDto { public string? Name { get; set; } public string? Email { get; set; } public string? Password { get; set; } }

    [Authorize]
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateUserDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (u == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Name)) u.Name = dto.Name.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Email)) u.Email = dto.Email.Trim();

        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }


    [Authorize]
    [HttpPost("me/avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest("Файл не передан");

        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user == null) return NotFound();

        // базовые лимиты/валидация
        const long MaxAvatarSize = 10 * 1024 * 1024; // 10 MB
        if (file.Length > MaxAvatarSize) return BadRequest("Файл слишком большой");

        // «прожарка» через ImageSharp (срежет EXIF, приведёт к JPEG)
        using var image = await Image.LoadAsync(file.OpenReadStream()); // упадёт, если это не картинка
        image.Mutate(x => x.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(512, 512) }));

        Directory.CreateDirectory(Path.Combine(_env.WebRootPath, "avatars"));
        var fileName = $"{Guid.NewGuid():N}.jpg";
        var path = Path.Combine(_env.WebRootPath, "avatars", fileName);
        await image.SaveAsJpegAsync(path, new JpegEncoder { Quality = 85 });

        user.AvatarUrl = $"/avatars/{fileName}";
        await _db.SaveChangesAsync();

        return Ok(new { avatarUrl = user.AvatarUrl });
    }



    [Authorize]
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q = "", [FromQuery] int take = 20)
    {
        var me = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        q = (q ?? "").Trim();

        var users = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id != me &&
                (q == "" ||
                 EF.Functions.ILike(u.Login!, $"%{q}%") ||
                 EF.Functions.ILike(u.Name!, $"%{q}%") ||
                 EF.Functions.ILike(u.Email!, $"%{q}%")))
            .OrderBy(u => u.Login)
            .Take(Math.Clamp(take, 1, 50))
            .Select(u => new {
                id = u.Id,
                login = u.Login,
                name = u.Name,
                email = u.Email,
                avatarUrl = u.AvatarUrl
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpGet("{id:int}/members")]
    public async Task<IActionResult> GetMembers(int id)
    {
        var users = await _db.ChatUsers
            .AsNoTracking()
            .Where(x => x.ChatId == id)
            .Select(x => new {
                id = x.UserId,
                name = x.User!.Name,
                avatarUrl = x.User.AvatarUrl,    
                lastSeenMessageId = x.LastSeenMessageId
            })
            .ToListAsync();

        return Ok(users);
    }


    public record SeenDto(int upToMessageId);
    [Authorize]
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
    [HttpPut("me/email")]
    public async Task<IActionResult> ChangeEmail([FromBody] ChangeEmailDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest("Email и пароль обязательны.");

        var uid = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == uid);
        if (u == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(dto.Password, u.Password))
            return Problem(statusCode: 403, detail: "Неверный пароль.");

        u.Email = dto.Email.Trim();
        await _db.SaveChangesAsync();
        return Ok(new { ok = true, email = u.Email });
    }

    [Authorize]
    [HttpPut("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.CurrentPassword) || string.IsNullOrWhiteSpace(dto.NewPassword))
            return BadRequest("Текущий и новый пароли обязательны.");

        if (dto.NewPassword.Length < 6)
            return BadRequest("Новый пароль слишком короткий.");

        var uid = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == uid);
        if (u == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, u.Password))
            return Problem(statusCode: 403, detail: "Неверный текущий пароль.");

        u.Password = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    [Authorize]
    [HttpPost("me/keys")]
    public async Task<IActionResult> UpsertKeys([FromBody] KeysDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.FindAsync(userId);
        if (u == null) return NotFound();
        u.EcdhPublicJwk = dto.EcdhPublicJwk.Trim();
        u.SignPublicJwk = dto.SignPublicJwk.Trim();
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }


    [AllowAnonymous]
    [HttpGet("{id:int}/keys")]
    public async Task<IActionResult> GetKeys(int id)
    {
        var u = await _db.Users
       .Where(x => x.Id == id)
       .Select(x => new { ecdhPublicJwk = x.EcdhPublicJwk, signPublicJwk = x.SignPublicJwk })
       .FirstOrDefaultAsync();

        if (u == null || u.ecdhPublicJwk == null || u.signPublicJwk == null) return NotFound();
        return Ok(u);
    }

}
