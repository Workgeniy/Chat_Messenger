using System.Security.Claims;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

        if (!string.IsNullOrWhiteSpace(dto.Name)) u.Name = dto.Name;
        if (!string.IsNullOrWhiteSpace(dto.Email)) u.Email = dto.Email;
        if (!string.IsNullOrWhiteSpace(dto.Password)) u.Password = dto.Password; // TODO: заменить на хэш

        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    [Authorize]
    [HttpPost("me/avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest("Файл не передан");

        var me = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == me);
        if (user == null) return NotFound();

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp" };
        if (!allowed.Contains(ext)) return BadRequest("Разрешены jpg/jpeg/png/webp");

        Directory.CreateDirectory(Path.Combine(_env.WebRootPath, "avatars"));
        var fileName = $"{Guid.NewGuid():N}{ext}";
        var path = Path.Combine(_env.WebRootPath, "avatars", fileName);

        using (var fs = System.IO.File.Create(path))
            await file.CopyToAsync(fs);

        // сохраним относительный url
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
                         EF.Functions.ILike(u.Name!, $"%{q}%") ||
                         EF.Functions.ILike(u.Email!, $"%{q}%")))
            .OrderBy(u => u.Name)
            .Take(Math.Clamp(take, 1, 50))
            .Select(u => new {
                id = u.Id,
                name = u.Name,
                email = u.Email,
                avatarUrl = u.AvatarUrl
            })
            .ToListAsync();

        return Ok(users);
    }
}
