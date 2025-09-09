
import { useEffect, useRef, useState } from "react";
import { authFetch } from "../../lib/api";
import { toFullUrl } from "../../lib/url";

const blobCache = new Map<string, string>(); // url -> objectURL

export function AuthImg({
                            src,
                            alt = "",
                            className,
                            fallback,
                        }: {
    src?: string | null;
    alt?: string;
    className?: string;
    fallback?: string; // например, dicebear
}) {
    const [resolved, setResolved] = useState<string | undefined>(undefined);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const full = src ? toFullUrl(src) : undefined;

        // нет урла — сразу в фолбэк
        if (!full) {
            setResolved(fallback);
            return () => { mountedRef.current = false; };
        }

        // если это НЕ /api/attachments — отдаем как есть (публичный CDN и т.п.)
        if (!full.startsWith("/api/attachments/") && !full.includes("/api/attachments/")) {
            setResolved(full);
            return () => { mountedRef.current = false; };
        }

        // кэш
        const cached = blobCache.get(full);
        if (cached) {
            setResolved(cached);
            return () => { mountedRef.current = false; };
        }

        let created: string | undefined;

        (async () => {
            try {
                const r = await authFetch(full);
                if (!r.ok) throw new Error(await r.text());
                const b = await r.blob();
                created = URL.createObjectURL(b);
                blobCache.set(full, created);
                if (mountedRef.current) setResolved(created);
            } catch {
                if (mountedRef.current) setResolved(fallback);
            }
        })();

        // objectURL не ревокаем, пока он есть в кэше (используется в списке)
        return () => { mountedRef.current = false; };
    }, [src, fallback]);

    return (
        <img
            src={resolved}
            alt={alt}
            className={className}
            onError={(e) => { if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }}
            draggable={false}
        />
    );
}
