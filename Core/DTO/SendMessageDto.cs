using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class SendMessageDto
    {
        public int ChatId { get; set; }
        public string? Text { get; set; }
        public List<int>? Attachments { get; set; }
    }
}
