using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

// Core/Entities/MessageReaction.cs
using System.ComponentModel.DataAnnotations;

namespace Core.Entities
{
    public class MessageReaction
    {
        public int MessageId { get; set; }
        public Message Message { get; set; } = default!;

        public int UserId { get; set; }
        public User User { get; set; } = default!;

        [MaxLength(16)]           
        public string Emoji { get; set; } = default!;

        public DateTime CreatedUtc { get; set; }
    }
}

