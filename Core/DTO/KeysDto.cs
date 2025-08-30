using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core.DTO
{
    public class KeysDto
    {
        public string EcdhPublicJwk { get; set; } = null!;
        public string SignPublicJwk { get; set; } = null!;
    }
}
