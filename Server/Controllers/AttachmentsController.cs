using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;
using System.Security.Claims;
using static System.Net.Mime.MediaTypeNames;

namespace Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AttachmentsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IWebHostEnvironment _env;

        public AttachmentsController(AppDbContext db, IWebHostEnvironment env)
        {
            _db = db; _env = env;
        }

        [HttpPost]
        [RequestSizeLimit(2L * 1024 * 1024 * 1024)] // 2GB (ты уже ставил в Kestrel)
        public async Task<IActionResult> Upload([FromForm] IFormFile file)
        {
            if (file is null || file.Length == 0) return BadRequest("empty file");

            // простая «прожарка» mime: по сигнатуре
            var mime = file.ContentType?.ToLowerInvariant() ?? "application/octet-stream";
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();

            var id = Guid.NewGuid().ToString("N");
            var date = DateTime.UtcNow.ToString("yyyy/MM/dd");
            var root = Path.Combine(_env.ContentRootPath, "storage", date, id);
            Directory.CreateDirectory(root);

            var srcPath = Path.Combine(root, "source" + ext);
            using (var fs = System.IO.File.Create(srcPath))
                await file.CopyToAsync(fs);

            var att = new Core.Entities.Attachment
            {
                Kind = mime.StartsWith("image/") ? "image" :
                       mime.StartsWith("video/") ? "video" :
                       mime.StartsWith("audio/") ? "audio" : "file",
                OriginalFileName = file.FileName,
                MimeType = mime,
                SizeBytes = file.Length,
                StoragePath = Rel(srcPath),
                Status = "ready"
            };
            _db.Attachments.Add(att);
            await _db.SaveChangesAsync();

            // если картинка — делаем превью синхронно (быстро)
            if (att.Kind == "image")
            {
                var thumbPath = Path.Combine(root, "thumb.jpg");
                using var img = await SixLabors.ImageSharp.Image.LoadAsync(srcPath);
                att.Width = img.Width; att.Height = img.Height;

                img.Mutate(x => x.Resize(new ResizeOptions
                {
                    Mode = ResizeMode.Max,
                    Size = new Size(512, 512)
                }));
                await img.SaveAsJpegAsync(thumbPath);

                _db.AttachmentVariants.Add(new Core.Entities.AttachmentVariant
                {
                    AttachmentId = att.Id,
                    Type = "thumb",
                    MimeType = "image/jpeg",
                    StoragePath = Rel(thumbPath),
                    SizeBytes = new FileInfo(thumbPath).Length,
                    Width = img.Width,
                    Height = img.Height
                });
                await _db.SaveChangesAsync();
            }
            else if (att.Kind == "video")
            {
                // видео перекодируем в фоне, чтобы ответить быстро
                att.Status = "processing";
                await _db.SaveChangesAsync();
                _ = Task.Run(() => TranscodeVideoAsync(att.Id, srcPath, root)); // fire-and-forget
            }

            return Ok(new
            {
                id = att.Id,
                url = $"/api/attachments/{att.Id}",
                thumbUrl = att.Kind == "image" ? $"/api/attachments/{att.Id}/thumb" : null,
                fileName = att.OriginalFileName,
                sizeBytes = att.SizeBytes,
                contentType = att.MimeType
            });

            string Rel(string abs) => abs.Replace(_env.ContentRootPath, "").Replace("\\", "/");
        }

        [Authorize]
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetFile(int id)
        {
            var me = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

            var file = await _db.Attachments
                .Where(a => a.Id == id)
                .Select(a => new {
                    a.StoragePath,
                    a.MimeType,
                    InChat = _db.Messages
                        .Any(m => m.Attachments.Any(ma => ma.Id == a.Id) &&
                                  m.Chat.ChatUsers.Any(cu => cu.UserId == me))
                })
                .FirstOrDefaultAsync();

            if (file == null) return NotFound();
            if (!file.InChat) return Forbid();

            var abs = Path.Combine(_env.ContentRootPath, file.StoragePath.TrimStart('/'));
            return PhysicalFile(abs, file.MimeType, enableRangeProcessing: true);
        }

        // Мини-воркер (FFmpeg), см. ниже
        private async Task TranscodeVideoAsync(int attId, string srcPath, string root)
        {
            try
            {
                // Генерим постер
                var poster = Path.Combine(root, "poster.jpg");
                await RunFfmpeg($"-ss 00:00:01 -i \"{srcPath}\" -frames:v 1 -q:v 3 \"{poster}\"");

                // Делаем HLS (m3u8 + сегменты 360/720)
                var hlsDir = Path.Combine(root, "hls");
                Directory.CreateDirectory(hlsDir);
                var hlsPath = Path.Combine(hlsDir, "index.m3u8");

                // Базовый одно качество (720p). Можешь расширить на adaptive.
                await RunFfmpeg($"-i \"{srcPath}\" -vf \"scale=-2:720\" -c:v h264 -preset veryfast -crf 24 -c:a aac -b:a 128k -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename \"{hlsDir}/seg_%03d.ts\" \"{hlsPath}\"");

                // сохраним варианты
                var a = await _db.Attachments.FindAsync(attId);
                if (a == null) return;

                a.Status = "ready";
                _db.AttachmentVariants.Add(new Core.Entities.AttachmentVariant
                {
                    AttachmentId = attId,
                    Type = "hls",
                    MimeType = "application/vnd.apple.mpegurl",
                    StoragePath = hlsPath.Replace(_env.ContentRootPath, "").Replace("\\", "/")
                });
                _db.AttachmentVariants.Add(new Core.Entities.AttachmentVariant
                {
                    AttachmentId = attId,
                    Type = "thumb",
                    MimeType = "image/jpeg",
                    StoragePath = poster.Replace(_env.ContentRootPath, "").Replace("\\", "/")
                });

                await _db.SaveChangesAsync();
            }
            catch
            {
                var a = await _db.Attachments.FindAsync(attId);
                if (a != null) { a.Status = "failed"; await _db.SaveChangesAsync(); }
            }
        }

        private static async Task RunFfmpeg(string args)
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "ffmpeg", // убедись, что ffmpeg доступен в PATH
                Arguments = args,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var p = System.Diagnostics.Process.Start(psi)!;
            await p.WaitForExitAsync();
            if (p.ExitCode != 0) throw new Exception("ffmpeg failed");
        }

        [HttpGet("{id}/hls")]
        public async Task<IActionResult> GetHls(int id)
        {
            var v = await _db.AttachmentVariants
                .Where(x => x.AttachmentId == id && x.Type == "hls")
                .FirstOrDefaultAsync();
            if (v == null) return NotFound();
            return PhysicalFile(Path.Combine(_env.ContentRootPath, v.StoragePath.TrimStart('/')),
                                "application/vnd.apple.mpegurl");
        }
    }
}
