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
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> UploadAvatar([FromForm] IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest("empty file");
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (u == null) return NotFound();

        var folder = Path.Combine(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"), "avatars");
        Directory.CreateDirectory(folder);
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var name = $"{userId}_{Guid.NewGuid():N}{ext}";
        var path = Path.Combine(folder, name);
        await using (var fs = System.IO.File.Create(path)) { await file.CopyToAsync(fs); }

        u.AvatarUrl = $"/avatars/{name}";
        await _db.SaveChangesAsync();
        return Ok(new { avatarUrl = u.AvatarUrl });
    }

    [Authorize]
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return Ok(Array.Empty<object>());
        var list = await _db.Users
            .AsNoTracking()
            .Where(u => u.Name != null && EF.Functions.ILike(u.Name, $"%{query}%"))
            .OrderBy(u => u.Name)
            .Take(20)
            .Select(u => new { id = u.Id, name = u.Name!, email = u.Email, avatarUrl = u.AvatarUrl })
            .ToListAsync();
        return Ok(list);
    }
}
