const API = import.meta.env.VITE_API_BASE; // например, "/api"

export type LoginResp = { token: string; userId: number; displayName: string };

let token: string | null = null;
export function setToken(t: string) {
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
        return http<Array<{ id:number; title:string; unread:number }>>(`/chats`);
    },

    messages: (chatId: number, before?: string) =>
        http<Array<{ id:number; chatId:number; text:string; senderId:number; sentUtc:string }>>(
            `/messages?chatId=${chatId}${before ? `&before=${before}` : ""}&take=50`
        ),

    sendMessage: (chatId: number, text: string, attachments?: string[]) =>
        http(`/messages`, { method: "POST", body: JSON.stringify({ chatId, text, attachments }) }),

    upload: (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return http<{ id: string; url?: string }>(`/attachments`, { method: "POST", body: form });
    }
};
