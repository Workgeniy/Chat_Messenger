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

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<ChatUser>().
                HasKey(chatUser => new { chatUser.UserId, chatUser.ChatId });

        }
    }
}
