using Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }


            public DbSet<User> Users => Set<User>();
            public DbSet<Chat> Chats => Set<Chat>();
            public DbSet<ChatUser> ChatUsers => Set<ChatUser>();
            public DbSet<Message> Messages => Set<Message>();
            public DbSet<Attachment> Attachments => Set<Attachment>();
            public DbSet<AttachmentVariant> AttachmentVariants => Set<AttachmentVariant>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ChatUser — составной ключ
            modelBuilder.Entity<ChatUser>()
                .HasKey(x => new { x.UserId, x.ChatId });

            modelBuilder.Entity<ChatUser>()
                .HasOne(x => x.Chat)
                .WithMany(c => c.ChatUsers)
                .HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ChatUser>()
                .HasOne(x => x.User)
                .WithMany() // если у User нет коллекции Chats
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Message -> Chat
            modelBuilder.Entity<Message>()
                .HasOne(m => m.Chat)
                .WithMany(c => c.Messages)
                .HasForeignKey(m => m.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            // Message -> Sender (User)
            modelBuilder.Entity<Message>()
                .HasOne(m => m.Sender)
                .WithMany() // если у User нет коллекции Messages
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.Restrict);

 

            modelBuilder.Entity<Message>()
                .HasOne(m => m.ReplyToMessage)
                .WithMany()
                .HasForeignKey(m => m.ReplyToMessageId)
                .OnDelete(DeleteBehavior.Restrict);

            // Индексы, время в UTC
            modelBuilder.Entity<Message>().HasIndex(m => new { m.ChatId, m.Sent });
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        }

    }
}

