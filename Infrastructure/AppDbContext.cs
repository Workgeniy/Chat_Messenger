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
            public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // ChatUser — составной ключ
            modelBuilder.Entity<ChatUser>()
                .HasKey(x => new { x.UserId, x.ChatId });

            modelBuilder.Entity<ChatUser>()
                .HasOne(x => x.Chat).WithMany(c => c.ChatUsers)
                .HasForeignKey(x => x.ChatId).OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ChatUser>()
                .HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

            // Message -> Chat
            modelBuilder.Entity<Message>()
                .HasOne(m => m.Chat).WithMany(c => c.Messages)
                .HasForeignKey(m => m.ChatId).OnDelete(DeleteBehavior.Cascade);

            // Message -> Sender
            modelBuilder.Entity<Message>()
                .HasOne(m => m.Sender).WithMany()
                .HasForeignKey(m => m.SenderId).OnDelete(DeleteBehavior.Restrict);

            // ReplyTo (self-reference)
            modelBuilder.Entity<Message>()
                .HasOne(m => m.ReplyToMessage).WithMany()
                .HasForeignKey(m => m.ReplyToMessageId)
                .OnDelete(DeleteBehavior.Restrict);

            // Индексы
            modelBuilder.Entity<Message>().HasIndex(m => new { m.ChatId, m.Sent });

            modelBuilder.Entity<User>(b =>
            {
                b.Property(x => x.Login).IsRequired().HasMaxLength(50);
                b.HasIndex(x => x.Login).IsUnique();

                b.Property(x => x.Email).IsRequired(false).HasMaxLength(255);
                b.HasIndex(x => x.Email).IsUnique();
            });



            // REACTIONS
            modelBuilder.Entity<MessageReaction>()
                .HasKey(r => new { r.MessageId, r.UserId, r.Emoji });

            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.Emoji).HasMaxLength(16);

            modelBuilder.Entity<MessageReaction>()
                .Property(r => r.CreatedUtc)
                .HasDefaultValueSql("timezone('utc', now())");

            modelBuilder.Entity<MessageReaction>()
                .HasOne(r => r.Message).WithMany(m => m.Reactions)
                .HasForeignKey(r => r.MessageId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<MessageReaction>()
                .HasOne(r => r.User).WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);


            modelBuilder.Entity<MessageReaction>()
                .HasOne(r => r.Message)
                .WithMany(m => m.Reactions)
                .HasForeignKey(r => r.MessageId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<MessageReaction>()
                .HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        }

    }
}

