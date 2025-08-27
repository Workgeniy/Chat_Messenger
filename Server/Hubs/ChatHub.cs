using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Server.Services;
using System.Security.Claims;
using System.Text.RegularExpressions;

namespace Server.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly AppDbContext _db;
        private readonly IPresenceService _presence;
        public ChatHub(AppDbContext db, IPresenceService presence) {
            _db = db;
            _presence = presence;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = GetUserId();
            if (userId is null) return;

            _presence.Connected(userId.Value, Context.ConnectionId);

            await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId.Value}");
            // ✅ подписываем соединение на все чаты пользователя
            var chatIds = await _db.ChatUsers
                .Where(cu => cu.UserId == userId.Value)
                .Select(cu => cu.ChatId)
                .ToListAsync();

            foreach (var cid in chatIds)
                await Groups.AddToGroupAsync(Context.ConnectionId, Group(cid));

            await Clients.Caller.SendAsync("PresenceSnapshot", _presence
                .GetOnlineUserIds()
                .Select(id => new { userId = id, isOnline = true, lastSeenUtc = (DateTime?)null }));

            await Clients.All.SendAsync("PresenceChanged",
                new { userId, isOnline = true, lastSeenUtc = (DateTime?)null });

            await base.OnConnectedAsync();
        }


        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var userId = GetUserId();
            if (userId is null) return;

            _presence.Disconnected(userId.Value, Context.ConnectionId);

            // если совсем вышел (нет активных подключений) — обновим LastSeen и сообщим остальным
            if (!_presence.IsOnline(userId.Value))
            {
                var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId.Value);
                if (u != null)
                {
                    u.LastSeenUtc = DateTime.UtcNow;
                    await _db.SaveChangesAsync();
                }

                await Clients.All.SendAsync("PresenceChanged", new { userId, isOnline = false, lastSeenUtc = u?.LastSeenUtc });
            }

            await base.OnDisconnectedAsync(exception);
        }

        // Клиент вызывает после выбора чата
        public Task JoinChat(int chatId) =>
            Groups.AddToGroupAsync(Context.ConnectionId, Group(chatId));

        public Task LeaveChat(int chatId) =>
            Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(chatId));

        // Индикатор "печатает..."
        public async Task Typing(int chatId)
        {
            var userId = GetUserId();
            if (userId is null) return;

            var displayName = await _db.Users
                .Where(u => u.Id == userId)
                .Select(u => u.Name)
                .FirstOrDefaultAsync();

            await Clients.Group(Group(chatId))
                .SendAsync("UserTyping", new { chatId, userId, displayName });
        }

        private static string Group(int chatId) => $"chat:{chatId}";

        private int? GetUserId()
        {
            var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : (int?)null;
        }
    }
} 
