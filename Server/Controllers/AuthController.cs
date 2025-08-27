using Core.DTO;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;

namespace Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _config;

        public AuthController(AppDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }


        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto dto)
        {
            var login = (dto.Login ?? "").Trim().ToLowerInvariant();
            var name = (dto.Name ?? "").Trim();
            var email = (dto.Email ?? "").Trim();

            if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest("Логин, имя и пароль обязательны.");

            // допустим: латиница/цифры/._-, длина 3..30
            var loginOk = Regex.IsMatch(login, "^[a-z0-9._-]{3,30}$");
            if (!loginOk) return BadRequest("Логин должен быть 3–30 символов: латиница, цифры, . _ -");

            // Проверка уникальности логина (регистр НЕ важен — мы храним в нижнем регистре)
            var existsLogin = await _db.Users.AnyAsync(u => u.Login == login);
            if (existsLogin) return Conflict("Логин уже занят.");

            if (!string.IsNullOrEmpty(email))
            {
                // email уникален, если он у вас уникальный в БД
                var existsEmail = await _db.Users.AnyAsync(u => u.Email == email);
                if (existsEmail) return Conflict("Email уже занят.");
            }

            // ---- Пароль: хэшируем (рекомендовано) ----
            // Требуется пакет BCrypt.Net-Next (BCrypt.Net-Next)
            // dotnet add package BCrypt.Net-Next
            var pwdHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

            var user = new User 
            {
                Login = login,
                Name = name,
                Email = string.IsNullOrWhiteSpace(email) ? null : email,
                Password = pwdHash,               // ХРАНИМ ХЭШ!
                LastSeenUtc = null,
                IsOnline = false,
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return Ok(new
            {
                token,
                userId = user.Id,
                login = user.Login,
                name = user.Name,
                email = user.Email,
                avatarUrl = user.AvatarUrl
            });
        }

        /// <summary>
        /// Логин по login + password
        /// </summary>
        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            var login = (dto.Login ?? "").Trim().ToLowerInvariant();
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Login == login);

            if (user == null)
                return Unauthorized("Неверный логин или пароль.");

            // ---- Проверка пароля ----
            var ok = BCrypt.Net.BCrypt.Verify(dto.Password, user.Password); // сравниваем с хэшем
            // Если без хэширования, временно:
            // var ok = string.Equals(user.Password, dto.Password);

            if (!ok) return Unauthorized("Неверный логин или пароль.");

            var token = GenerateJwtToken(user);

            return Ok(new
            {
                token,
                userId = user.Id,
                login = user.Login,
                name = user.Name,
                email = user.Email,
                avatarUrl = user.AvatarUrl
            });
        }

        /// <summary>
        /// Проверка занятости логина (например, для подсказки на форме регистрации)
        /// </summary>
        [AllowAnonymous]
        [HttpGet("check-login")]
        public async Task<IActionResult> CheckLogin([FromQuery] string login)
        {
            var normalized = (login ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalized))
                return BadRequest(new { available = false, reason = "empty" });

            var okFormat = Regex.IsMatch(normalized, "^[a-z0-9._-]{3,30}$");
            if (!okFormat)
                return Ok(new { available = false, reason = "format" });

            var exists = await _db.Users.AnyAsync(u => u.Login == normalized);
            return Ok(new { available = !exists });
        }

        /// <summary>
        /// Сид данных — обновлён под логины
        /// </summary>
        [AllowAnonymous]
        [HttpPost("seed")]
        public async Task<IActionResult> Seed()
        {
            if (!await _db.Users.AnyAsync())
            {
                var pwd = BCrypt.Net.BCrypt.HashPassword("Passw0rd!");
                _db.Users.AddRange(
                    new User { Login = "alice", Name = "Alice", Email = "alice@example.com", Password = pwd },
                    new User { Login = "bob", Name = "Bob", Email = "bob@example.com", Password = pwd }
                );
                await _db.SaveChangesAsync();
                return Ok("Тестовые пользователи созданы: alice / bob (Passw0rd!)");
            }
            return Ok("Пользователи уже есть");
        }

        private string GenerateJwtToken(User user)
        {
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Name ?? ""),
                new Claim("login", user.Login ?? "") // полезно иметь логин в токене
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var jwt = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }
    }
}
