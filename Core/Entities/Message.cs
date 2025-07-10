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
        public Chat Chat { get; set; }

        public int SenderId { get; set; }   
        public User Sender { get; set; }

        public string? Content { get; set; }
        public DateTime Sent {  get; set; }

        public int? ReplyToMessageId { get; set; }
        public Message? ReplyToiMessage { get; set; }


        public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
    }
}
