using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class ChangePasswordDto { 
        public string? CurrentPassword { get; set; } 
        public string? NewPassword { get; set; } 
    }

}
