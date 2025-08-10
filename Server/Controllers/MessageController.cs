using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Hubs;

namespace Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MessagesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<ChatHub> _hub;

    public MessagesController(AppDbContext db, IHubContext<ChatHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    // GET /api/messages?chatId=1&before=2025-08-10T10:00:00Z&take=50
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int chatId, [FromQuery] DateTime? before, [FromQuery] int take = 50)
    {
        var q = _db.Messages.AsNoTracking().Where(m => m.ChatId == chatId);
        if (before.HasValue) q = q.Where(m => m.Sent < before.Value.ToUniversalTime());

        var list = await q
            .OrderBy(m => m.Sent)
            .Take(take)
            .Select(m => new
            {
                id = m.Id,
                chatId = m.ChatId,
                text = m.Content,
                senderId = m.SenderId,
                sentUtc = DateTime.SpecifyKind(m.Sent, DateTimeKind.Utc),
                attachments = m.Attachments.Select(a => new {
                    id = a.Id,
                    contentType = a.MimeType
                }).ToList()
            })
            .ToListAsync();

        return Ok(list);
    }

    public class SendMessageDto
    {
        public int ChatId { get; set; }
        public string? Text { get; set; }
        public List<string>? Attachments { get; set; } // ids, если используешь загрузку
    }

    // POST /api/messages
    [HttpPost]
    public async Task<IActionResult> Post([FromBody] SendMessageDto dto)
    {
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        var exists = await _db.Chats.AnyAsync(c => c.Id == dto.ChatId);
        if (!exists) return NotFound("Chat not found");

        var msg = new Core.Entities.Message
        {
            ChatId = dto.ChatId,
            SenderId = userId,
            Content = dto.Text,
            Sent = DateTime.UtcNow
        };
        _db.Messages.Add(msg);
        await _db.SaveChangesAsync();

        // Если у тебя есть таблица Attachments и upload — тут можно привязать их к msg.Id по dto.Attachments

        var payload = new
        {
            id = msg.Id,
            chatId = msg.ChatId,
            text = msg.Content,
            senderId = msg.SenderId,
            sentUtc = DateTime.SpecifyKind(msg.Sent, DateTimeKind.Utc),
            attachments = Array.Empty<object>()
        };

        // рассылаем всем участникам чата (группа "chat:{id}")
        await _hub.Clients.Group($"chat:{dto.ChatId}").SendAsync("MessageCreated", payload);

        return Ok(payload);
    }
}
