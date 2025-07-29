using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class CreateMessageDto
    {
        public int ChatId { get; set; }
        public int SenderId { get; set; }
        public string? Content { get; set; }
        public List<AttachmentDto> Attachments { get; set; } = new();
    }
}
