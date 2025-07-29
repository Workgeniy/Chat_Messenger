using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class AttachmentDto
    {
        public string FileName { get; set; }
        public string MimeType { get; set; }
        public long FileSize { get; set; }
        public string FilePath {  get; set; }
        public string? ThumbnailPath { get; set; }
    }
}
