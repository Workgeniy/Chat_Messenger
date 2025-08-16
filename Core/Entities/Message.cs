using System;
using System.Collections.Generic;
using System.Linq;

using System.Text;
using System.Threading.Tasks;

namespace Core.Entities
{

    public class Message
    {
        public int Id { get; set; }

        public int ChatId { get; set; }
        public Chat Chat { get; set; } = default!;

        public int SenderId { get; set; }
        public User Sender { get; set; } = default!;

        public string? Content { get; set; }
        public DateTime Sent { get; set; }

        public int? ReplyToMessageId { get; set; }
        public Message? ReplyToMessage { get; set; }

        public bool IsDeleted { get; set; }     
        public DateTime? EditedUtc { get; set; }     

        public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
        public ICollection<MessageReaction> Reactions { get; set; } = new List<MessageReaction>();
    }
}

