using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.Entities
{
    public class AttachmentVariant
    {
        public int Id { get; set; }
        public int AttachmentId { get; set; }
        public Attachment Attachment { get; set; } = null!;

        public string Type { get; set; } = "";     // "thumb" | "image:1080" | "video:720" | "hls"
        public string MimeType { get; set; } = "";
        public long SizeBytes { get; set; }
        public string StoragePath { get; set; } = "";
        public int? Width { get; set; }
        public int? Height { get; set; }
    }
}
