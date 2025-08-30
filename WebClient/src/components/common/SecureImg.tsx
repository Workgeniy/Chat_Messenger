
import { useEffect, useState } from "react";
import { authFetch } from "../../lib/api";

export default function SecureImg({
                                      src, alt = "", fallback, ...imgProps
                                  }: { src?: string; alt?: string; fallback?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let revoke: string | null = null;
        (async () => {
            if (!src) { setUrl(fallback ?? null); return; }
            try {
                // внешние/публичные URL показываем напрямую
                if (!src.startsWith("/api/")) { setUrl(src); return; }
                const r = await authFetch(src);
                if (!r.ok) { setUrl(fallback ?? null); return; }
                const b = await r.blob();
                const u = URL.createObjectURL(b);
                setUrl(u); revoke = u;
            } catch { setUrl(fallback ?? null); }
        })();
        return () => { if (revoke) URL.revokeObjectURL(revoke); };
    }, [src, fallback]);

    return <img src={url ?? fallback} alt={alt} {...imgProps} />;
}
