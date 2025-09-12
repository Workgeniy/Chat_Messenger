export const API_HOST = import.meta.env.VITE_API_HOST || ""; // например http://localhost:5157
export function toFullUrl(path?: string | null) {
    if (!path) return "";
    return path.startsWith("http") ? path : `${API_HOST}${path}`;
}
export function fallbackAvatar(name?: string) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || "U")}`;
}

// utils/url.ts
export function toSafeImgUrl(u?: string | null): string | undefined {
    if (!u) return undefined;
    if (u.startsWith('data:') || u.startsWith('blob:')) return u;

    try {
        // Превратим что угодно в URL относительно текущего origin
        const url = new URL(u, window.location.origin);
        // Делаем ПУТЬ относительным к домену → исчезают http/https и доменные несостыковки
        return url.pathname + url.search + url.hash;
    } catch {
        // Если пришла странная относительная строка без / — подправим
        return u.startsWith('/') ? u : '/' + u;
    }
}
