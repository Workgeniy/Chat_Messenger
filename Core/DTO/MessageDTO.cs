using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class MessageDTO
    {
        public int Id { get; set; }
        public int ChatId { get; set; }
        public int SenderId { get; set; }
        public string? Content { get; set; }
        public DateTime SentAt { get; set; }
        public int? ReplyToMessageId { get; set; }

        public List<AttachmentDto> Attachments { get; set; }
    }
}
