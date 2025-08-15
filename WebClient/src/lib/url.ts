export const API_HOST = import.meta.env.VITE_API_HOST || ""; // например http://localhost:5157
export function toFullUrl(path?: string | null) {
    if (!path) return "";
    return path.startsWith("http") ? path : `${API_HOST}${path}`;
}
export function fallbackAvatar(name?: string) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || "U")}`;
}