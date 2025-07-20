using Core.DTO;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
                        FileSize = attachmentDto.FileSize
                    };
                    context.Attachments.Add(attachment);
                }

                await context.SaveChangesAsync();
            }

            return Ok(new MessageDTO
            {
                Id = message.Id,
                ChatId = message.ChatId,
                SenderId= message.SenderId,
                Content= message.Content,
                SentAt = message.Sent,
                ReplyToMessageId = message.ReplyToMessageId,
                Attachments = dto.Attachments ?? new List<AttachmentDto>()
            });
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
                        FileSize = attachment.FileSize
                    }).ToList()
                }).ToListAsync();

            return Ok(message);
        }

    }
}
