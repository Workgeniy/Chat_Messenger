using System.Collections.Concurrent;

namespace Server.Services
{
    public interface IPresenceService
    {
        bool IsOnline(int userId);
        void Connected(int userId, string connectionId);
        void Disconnected(int userId, string connectionId);
        IReadOnlyCollection<string> GetConnections(int userId);

        // Снимок тех, у кого есть активные коннекты
        IReadOnlyCollection<int> GetOnlineUserIds();
    }

    public class PresenceService : IPresenceService
    {
        private readonly ConcurrentDictionary<int, HashSet<string>> _map = new();

        public bool IsOnline(int userId) =>
            _map.TryGetValue(userId, out var set) && set.Count > 0;

        public void Connected(int userId, string connectionId)
        {
            var set = _map.GetOrAdd(userId, _ => new HashSet<string>());
            lock (set) set.Add(connectionId);
        }

        public void Disconnected(int userId, string connectionId)
        {
            if (_map.TryGetValue(userId, out var set))
            {
                lock (set) set.Remove(connectionId);
                if (set.Count == 0) _map.TryRemove(userId, out _);
            }
        }

        public IReadOnlyCollection<string> GetConnections(int userId) =>
            _map.TryGetValue(userId, out var set) ? set : Array.Empty<string>();

        public IReadOnlyCollection<int> GetOnlineUserIds() =>
            _map.Where(kv => kv.Value.Count > 0).Select(kv => kv.Key).ToArray();
    }
}
