// src/lib/api.ts
export type Chat = {
    id: number;
    title: string;
    avatarUrl?: string;
    isGroup: boolean;
    isOnline?: boolean | null;
    lastSeenUtc?: string | null;
    lastText?: string | null;
    lastUtc?: string | null;
    lastSenderId?: number | null;
    opponentId?: number | null;
    unreadCount?: number;
};

export type FoundUser = {
    id: number;
    name: string;
    email: string;
    avatarUrl?: string;
    isOnline?: boolean | null;
    lastSeenUtc?: string | null;
};

export type Msg = {
    id: number;
    chatId: number;
    text: string;
    senderId: number;
    sentUtc: string;
    editedUtc?: string | null;
    isDeleted?: boolean;
    attachments?: Array<{
        id: number | string;
        url?: string;
        thumbUrl?: string;
        contentType?: string;
        fileName?: string;
        sizeBytes?: number;
    }>;
    reactions?: { emoji: string; count: number; mine?: boolean }[];
    delivered?: boolean;
    readByMe?: boolean;
    readCount?: number;
    totalMembers?: number;
};

export type Participant = {
    id: number;
    name: string;
    avatarUrl?: string | null;
    isOnline?: boolean | null;
    lastSeenUtc?: string | null;
    lastSeenMessageId?: number | null;
};

export type StartChatResp = { id: number } | { chatId: number } | Chat;

let token: string | null = null;
export function setToken(t: string | null) { token = t; }

export type StoredAccount = {
    token: string;
    userId: number;
    name?: string;
    login?: string;
    avatarUrl?: string | null;
};
export type MeDto = { id: number; name: string; email: string; avatarUrl?: string | null };

// ⬇️ расширили, чтобы поддерживать новые поля
export type LoginResp = { token: string; userId: number; login: string; name: string; avatarUrl?: string | null };
export type RegisterResp = { token: string; userId: number; login: string; name: string; email?: string | null; avatarUrl?: string | null };


// ——— Топ-левел совместимые функции (оставляем как есть) ———
export async function getChatMembers(chatId: number) {
    const r = await fetch(`/api/chats/${chatId}/members`, { credentials: "include" });
    if (!r.ok) throw new Error("getMembers failed");
    return r.json();
}

export async function markSeen(chatId: number, upToMessageId: number) {
    const r = await fetch(`/api/chats/${chatId}/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ upToMessageId })
    });
    if (!r.ok) throw new Error("markSeen failed");
}

// ——— База ———
const API = import.meta.env.VITE_API_BASE || "/api";

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? (undefined as any) : res.json();
}

export const api = {
    // ⬇️ вход по ЛОГИНУ
    async login(login: string, password: string): Promise<LoginResp> {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    // ⬇️ регистрация с логином
    async register(login: string, name: string, email: string | null, password: string): Promise<RegisterResp> {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, name, email, password }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    me: () => http<MeDto>("/users/me"),

    myChats() { return http<Chat[]>(`/chats`); },

    messages: (chatId: number, before?: string) =>
        http<Msg[]>(`/messages?chatId=${chatId}${before ? `&before=${before}` : ""}&take=50`),

    sendMessage: (chatId: number, text: string, attachments?: number[]) =>
        http(`/messages`, { method: "POST", body: JSON.stringify({ chatId, text, attachments }) }),

    upload: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return http<{ id: number; url?: string }>(`/attachments`, { method: "POST", body: form });
    },

    async changeEmail(email: string, password: string) {
        const r = await fetch("/api/users/me/email", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    },

    async changePassword(currentPassword: string, newPassword: string) {
        const r = await fetch("/api/users/me/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        if (!r.ok) throw new Error(await r.text());
        return r.json();
    },

    logout() {
        token = null;
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("name");
        localStorage.removeItem("login");
    },

    searchUsers: (q: string) => http<FoundUser[]>(`/users/search?q=${encodeURIComponent(q)}`),

    startChatWith: (userId: number) => http<Chat>(`/chats/startWith/${userId}`, { method: "POST" }),

    updateMe: (data: { name?: string; email?: string; password?: string }) =>
        http(`/users/me`, { method: "PUT", body: JSON.stringify(data) }),

    uploadAvatar: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return http<{ avatarUrl: string }>(`/users/me/avatar`, { method: "POST", body: form });
    },

    editMessage: (id: number, text: string) =>
        http(`/messages/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),

    deleteMessage: (id: number) => http(`/messages/${id}`, { method: "DELETE" }),

    react: (id: number, emoji: string) =>
        http(`/messages/${id}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),

    unreact: (id: number, emoji: string) =>
        http(`/messages/${id}/react?emoji=${encodeURIComponent(emoji)}`, { method: "DELETE" }),

    createChat: (name: string, memberIds: number[], avatarUrl?: string) =>
        http<{ id: number; title: string; avatarUrl?: string; isGroup: true }>(
            `/chats/create`,
            { method: "POST", body: JSON.stringify({ name, memberIds, avatarUrl }) }
        ),

    getChatMembers: (chatId: number) =>
        http<{ id: number; name: string; avatarUrl?: string | null; isAdmin?: boolean; lastSeenMessageId?: number | null }[]>(
            `/chats/${chatId}/members`
        ),

    markSeen: (chatId: number, upToMessageId: number) =>
        http(`/chats/${chatId}/seen`, { method: "POST", body: JSON.stringify({ upToMessageId }) }),

    leaveChat: (chatId: number) => http(`/chats/${chatId}/leave`, { method: "POST" }),
};

// ——— Загрузка с прогрессом ———
export async function uploadWithProgress(
    file: File,
    onProgress?: (p: number) => void
): Promise<{ id: number; url?: string; thumbUrl?: string }> {

    const bearer = token || localStorage.getItem("token");

    return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/attachments`, true);
        // важно: не ставим Content-Type – его выставит браузер для multipart
        if (bearer) xhr.setRequestHeader("Authorization", `Bearer ${bearer}`);

        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && onProgress) {
                const p = Math.max(0, Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
                onProgress(p);
            }
        };

        xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4) return;

            // сервер ответил
            if (xhr.status >= 200 && xhr.status < 300) {
                const txt = xhr.responseText?.trim() || "";
                if (!txt) {
                    // на всякий случай – если вдруг вернули 204/пусто
                    resolve({ id: NaN });
                    return;
                }
                try {
                    const json = JSON.parse(txt);
                    resolve(json);
                } catch (e) {
                    console.error("bad json from /attachments:", txt);
                    reject(new Error("Bad JSON from /attachments"));
                }
            } else {
                const msg = xhr.responseText || `HTTP ${xhr.status}`;
                console.error("upload failed:", msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Upload aborted"));

        const form = new FormData();
        form.append("file", file); // имя ДОЛЖНО совпадать с [FromForm] IFormFile file
        xhr.send(form);
    });
}
