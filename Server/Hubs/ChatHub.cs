using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace Server.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly AppDbContext _db;
        public ChatHub(AppDbContext db) => _db = db;

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
            var claim = Context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : null;
        }
    }
} 
