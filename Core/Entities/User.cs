using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.Entities
{
    public class User
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string Login { get; set; } = null!;
        public string? Email { get; set; }
        public string Password { get; set; }

        public string? AvatarUrl { get; set; }

        public bool IsOnline {  get; set; }

        public DateTime? LastSeenUtc { get; set; }
    }
}
