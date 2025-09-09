using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class MemberDto
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string? AvatarUrl { get; set; }
        public bool IsAdmin { get; set; }
        public DateTime? LastSeenUtc { get; set; }
        bool IsOnline {  get; set; }
    }
}
