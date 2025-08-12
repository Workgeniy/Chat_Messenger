export type Chat = {
    id: number;
    title: string;
    avatarUrl?: string;
    isGroup: boolean;
    isOnline?: boolean | null;
    lastSeenUtc?: string | null;
};

const API = import.meta.env.VITE_API_BASE; // например, "/api"

export type LoginResp = { token: string; userId: number; displayName: string };

export type RegisterResp = { id:number; email:string; name:string };

let token: string | null = null;
export function setToken(t: string | null) {
    token = t;
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? (undefined as any) : res.json();
}

export const api = {
    async login(email: string, password: string): Promise<LoginResp> {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as LoginResp;
        setToken(data.token);
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", String(data.userId));
        localStorage.setItem("name", data.displayName);
        return data;
    },

    myChats() {
        return http<Chat[]>(`/chats`);
    },
    messages: (chatId: number, before?: string) =>
        http<Array<{ id:number; chatId:number; text:string; senderId:number; sentUtc:string;
            attachments?: Array<{ id:number|string; url?:string; contentType?:string }> }>>(
            `/messages?chatId=${chatId}${before ? `&before=${before}` : ""}&take=50`
        ),

    // тут была ошибка: стояло /api/messages -> давало /api/api/messages
    sendMessage: (chatId: number, text: string, attachments?: number[]) =>
        http(`/messages`, { method: "POST", body: JSON.stringify({ chatId, text, attachments }) }),

    // id у нас number (PK в БД), не string
    upload: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return http<{ id: number; url?: string }>(`/attachments`, { method: "POST", body: form });
    },

    logout() {
        token = null;
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("name");
    },

    me() {
        return http<{ id:number; name:string; email:string; avatarUrl?:string }>(`/users/me`);
    },

    updateMe(data: { name?:string; email?:string; password?:string }) {
        return http(`/users/me`, { method: "PUT", body: JSON.stringify(data) });
    },

    uploadAvatar(file: File) {
        const form = new FormData();
        form.append("file", file);
        return http<{ avatarUrl: string }>(`/users/me/avatar`, { method: "POST", body: form });
    },

    async register(name: string, email: string, password: string): Promise<RegisterResp> {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    searchUsers(query: string) {
        return http<Array<{ id:number; name:string; email?:string; avatarUrl?:string }>>(
            `/users/search?query=${encodeURIComponent(query)}`
        );
    }
};

export async function uploadWithProgress(
    file: File,
    onProgress?: (p: number) => void
): Promise<{ id: number; url?: string }> {
    const tokenHdr = token ? `Bearer ${token}` : localStorage.getItem("token") ? `Bearer ${localStorage.getItem("token")}` : "";
    return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/attachments`, true);
        if (tokenHdr) xhr.setRequestHeader("Authorization", tokenHdr);

        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && onProgress) {
                onProgress(Math.max(0, Math.min(100, Math.round((ev.loaded / ev.total) * 100))));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch { reject(new Error("Bad JSON from server")); }
            } else {
                reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
            }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Upload aborted"));

        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
    });
}
