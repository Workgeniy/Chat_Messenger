using Core.DTO;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using System.Runtime.InteropServices;

namespace Server.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    public class MessageController : ControllerBase
    {
        private readonly AppDbContext context;

        public MessageController(AppDbContext context)
        {
            this.context = context; 
        }

        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] MessageDTO dto){

            Message? message = new Message {
                ChatId = dto.ChatId,
                SenderId = dto.SenderId,
                Content = dto.Content,
                Sent = DateTime.UtcNow,
                ReplyToMessageId = dto.ReplyToMessageId,
            };

            context.Messages.Add(message);
            await context.SaveChangesAsync();

            if (dto.Attachments != null && dto.Attachments.Any())
            {
                foreach (var attachmentDto in dto.Attachments)
                {
                    var attachment = new Attachment
                    {
                        MessageId = message.Id,
                        FileName = attachmentDto.FileName,
                        MimeType = attachmentDto.MimeType,
                        FileSize = attachmentDto.FileSize,
                        FilePath = attachmentDto.FilePath
                    };
                    context.Attachments.Add(attachment);
                }

                await context.SaveChangesAsync();
            }

            var savedMessage = await context.Messages
            .Include(m => m.Attachments)
            .FirstOrDefaultAsync(m => m.Id == message.Id);


            return Ok(new MessageDTO
            {
                Id = savedMessage.Id,
                ChatId = savedMessage.ChatId,
                SenderId = savedMessage.SenderId,
                Content = savedMessage.Content,
                SentAt = savedMessage.Sent,
                ReplyToMessageId = savedMessage.ReplyToMessageId,
                Attachments = savedMessage.Attachments.Select(att => new AttachmentDto
                {
                    FileName = att.FileName,
                    MimeType = att.MimeType,
                    FileSize = att.FileSize,
                    FilePath = att.FilePath
                }).ToList()
            });

            //return Ok(new MessageDTO
            //{
            //    Id = message.Id,
            //    ChatId = message.ChatId,
            //    SenderId= message.SenderId,
            //    Content= message.Content,
            //    SentAt = message.Sent,
            //    ReplyToMessageId = message.ReplyToMessageId,
            //    Attachments = dto.Attachments ?? new List<AttachmentDto>()
            //});
        }

        [HttpGet("chat/{chatId}")]
        public async Task<IActionResult> GetMessagesByChatId(int chatId)
        {
            var message = await context.Messages
                .Include(attachment => attachment.Attachments)
                .Where(id => id.ChatId == chatId)
                .OrderBy(sent => sent.Sent)
                .Select(dto => new MessageDTO
                {
                    Id = dto.Id,
                    ChatId = dto.ChatId,
                    SenderId = dto.SenderId,
                    Content = dto.Content,
                    SentAt = dto.Sent,
                    ReplyToMessageId = dto.ReplyToMessageId,
                    Attachments = dto.Attachments.Select(attachment => new AttachmentDto
                    {
                        FileName = attachment.FileName,
                        MimeType = attachment.MimeType,
                        FileSize = attachment.FileSize,
                        FilePath = attachment.FilePath
                    }).ToList()
                }).ToListAsync();

            return Ok(message);
        }

        [HttpPost("attachment")]
        public async Task<IActionResult> UploadAttachment([FromForm] IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("Файл не выбран");

            var uploadsDir = Path.Combine("wwwroot", "uploads");
            if (!Directory.Exists(uploadsDir))
                Directory.CreateDirectory(uploadsDir);

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var originalName = Path.GetFileNameWithoutExtension(file.FileName);
            var uniqueName = Guid.NewGuid().ToString();

            string outputFileName;
            string mimeType;
            string? thumbnailFileName = null;

            string tempPath = Path.Combine(uploadsDir, $"{uniqueName}_original{ext}");
            await using (var stream = new FileStream(tempPath, FileMode.Create))
                await file.CopyToAsync(stream);

            if (file.ContentType.StartsWith("video/"))
            {
                outputFileName = $"{uniqueName}.mp4";
                var outputPath = Path.Combine(uploadsDir, outputFileName);

                string convertArgs = $"-i \"{tempPath}\" -vf scale=640:-2 -c:v libx264 -preset veryfast -crf 28 -y \"{outputPath}\"";
                var convertResult = await RunFfmpegAsync(convertArgs);
                if (!convertResult.success)
                    return StatusCode(500, $"Ошибка при конвертации видео: {convertResult.stderr}");

                // Генерация превью
                thumbnailFileName = $"{uniqueName}_thumb.jpg";
                var thumbnailPath = Path.Combine(uploadsDir, thumbnailFileName);
                string thumbArgs = $"-i \"{outputPath}\" -ss 00:00:01.000 -vframes 1 -q:v 2 -y \"{thumbnailPath}\"";

                var thumbResult = await RunFfmpegAsync(thumbArgs);
                if (!thumbResult.success)
                    return StatusCode(500, $"Ошибка при создании превью: {thumbResult.stderr}");

                System.IO.File.Delete(tempPath);
                mimeType = "video/mp4";
            }
            else if (file.ContentType.StartsWith("image/"))
            {
                outputFileName = $"{uniqueName}.webp";
                var outputPath = Path.Combine(uploadsDir, outputFileName);

                string arguments = $"-i \"{tempPath}\" -vf scale=1024:-2 -compression_level 6 -y \"{outputPath}\"";
                var result = await RunFfmpegAsync(arguments);
                if (!result.success)
                    return StatusCode(500, $"Ошибка при обработке изображения: {result.stderr}");

                System.IO.File.Delete(tempPath);
                mimeType = "image/webp";

                // Превью для изображения — можно не делать, так как оно и есть превью (webp)
            }
            else
            {
                outputFileName = $"{uniqueName}{ext}";
                var filePath = Path.Combine(uploadsDir, outputFileName);
                System.IO.File.Move(tempPath, filePath);
                mimeType = file.ContentType;
            }

            var fullPath = $"/uploads/{outputFileName}";
            var fileInfo = new FileInfo(Path.Combine(uploadsDir, outputFileName));

            return Ok(new AttachmentDto
            {
                FileName = file.FileName,
                MimeType = mimeType,
                FileSize = fileInfo.Length,
                FilePath = fullPath,
                ThumbnailPath = thumbnailFileName != null ? $"/uploads/{thumbnailFileName}" : null
            });
        }

        private async Task<(bool success, string stderr)> RunFfmpegAsync(string arguments)
        {
            // Указываем путь к ffmpeg, если на Windows
            string ffmpegPath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
                ? @"D:\ffmpeg-7.1.1-essentials_build\ffmpeg-7.1.1-essentials_build\bin\ffmpeg.exe"
                : "ffmpeg"; // на Unix-подобных системах используем системный ffmpeg

            var process = new System.Diagnostics.Process
            {
                StartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            Console.WriteLine($"[FFmpeg] Запуск команды: {ffmpegPath} {arguments}");

            try
            {
                process.Start();
            }
            catch (Exception ex)
            {
                return (false, $"Не удалось запустить ffmpeg: {ex.Message}");
            }

            string stderr = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            Console.WriteLine("[FFmpeg stderr]:");
            Console.WriteLine(stderr);

            return (process.ExitCode == 0, stderr);
        }



    }
}
