using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.Entities
{
    public class Attachment
    {
        public int Id { get; set; }
        public int? MessageId { get; set; }          // можно null до связывания
        public Message? Message { get; set; }

        public string Kind { get; set; } = "";      // "image" | "video" | "audio" | "file"
        public string OriginalFileName { get; set; } = "";
        public string MimeType { get; set; } = "";
        public long SizeBytes { get; set; }
        public string StoragePath { get; set; } = ""; // где лежит исходник

        public int? Width { get; set; }
        public int? Height { get; set; }

        public ICollection<AttachmentVariant> Variants { get; set; } = new List<AttachmentVariant>();
        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
        public string Status { get; set; } = "ready"; 
    }
}
