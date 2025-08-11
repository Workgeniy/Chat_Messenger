using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Server.Hubs;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Db
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Controllers & Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS для фронтенда (Vite http://localhost:5173)
builder.Services.AddCors(o =>
    o.AddPolicy("AllowDev", p => p
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()
    ));

// SignalR
builder.Services.AddSignalR();

// JWT
var keyBytes = Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]
    ?? throw new Exception("Jwt:Key not set"));

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(keyBytes)
    };

    // Передача токена в SignalR через query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/chatHub"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await SeedDemoDataAsync(db);
}

static async Task SeedDemoDataAsync(AppDbContext db)
{
    // 1) пользователи
    var alice = await db.Users.FirstOrDefaultAsync(u => u.Email == "alice@example.com");
    if (alice == null)
    {
        alice = new User { Name = "Alice", Email = "alice@example.com", Password = "Passw0rd!" };
        db.Users.Add(alice);
        await db.SaveChangesAsync();
    }

    var bob = await db.Users.FirstOrDefaultAsync(u => u.Email == "bob@example.com");
    if (bob == null)
    {
        bob = new User { Name = "Bob", Email = "bob@example.com", Password = "Passw0rd!" };
        db.Users.Add(bob);
        await db.SaveChangesAsync();
    }

    // 2) чат между ними (ищем диалог с этими двумя участниками)
    var chat = await db.Chats
        .Include(c => c.ChatUsers)
        .FirstOrDefaultAsync(c =>
            c.ChatUsers.Count == 2 &&
            c.ChatUsers.Any(x => x.UserId == alice.Id) &&
            c.ChatUsers.Any(x => x.UserId == bob.Id));

    if (chat == null)
    {
        chat = new Chat
        {
            // если у тебя поле называется Name — оставь Name; если Title — заполни Title
            Name = "Диалог",  // или Title = "Диалог"
            Created = DateTime.UtcNow, // если есть такое поле
            IsGroup = false            // если есть такое поле
        };
        db.Chats.Add(chat);
        await db.SaveChangesAsync();

        db.ChatUsers.AddRange(
            new ChatUser { ChatId = chat.Id, UserId = alice.Id, IsAdmin = true, Created = DateTime.UtcNow },
            new ChatUser { ChatId = chat.Id, UserId = bob.Id, IsAdmin = false, Created = DateTime.UtcNow }
        );
        await db.SaveChangesAsync();
    }

    // 3) первые сообщения
    var hasMsgs = await db.Messages.AnyAsync(m => m.ChatId == chat.Id);
    if (!hasMsgs)
    {
        db.Messages.AddRange(
            new Message { ChatId = chat.Id, SenderId = alice.Id, Content = "Привет, это тест!", Sent = DateTime.UtcNow.AddMinutes(-2) },
            new Message { ChatId = chat.Id, SenderId = bob.Id, Content = "Хай! Видно отлично 👋", Sent = DateTime.UtcNow.AddMinutes(-1) }
        );
        await db.SaveChangesAsync();
    }
}
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Без HTTPS в dev
app.UseCors("AllowDev");
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();


app.MapControllers();
app.MapHub<ChatHub>("/chatHub");

app.Run();
