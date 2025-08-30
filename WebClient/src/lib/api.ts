import {
    initAfterLogin,
    encryptForUser,
    tryDecryptFrom,
    selfTestE2EE,
    resetMyE2EEStorage,
    setActiveE2EEUser
} from "./crypto";

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

export async function editMessageE2EE(messageId: number, newText: string, opponentUserId: number) {
    let payload = newText;
    try {
        const myId = Number(localStorage.getItem("userId"));
        const forOpp = await encryptForUser(opponentUserId, newText, authFetch);
        const forMe = await encryptForUser(myId, newText, authFetch);
        payload = packDual({ v: "e2ee:dual1", to: forOpp, me: forMe });
    } catch (e) {
        console.error("E2EE encrypt (edit) failed", e);
    }
    return http(`/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ text: payload }) });
}

type AttSecret = {
    id: number;
    k: string;
    iv: string;
    mime: string;
    name: string;
    size: number;
    sha256?: string;
    thumbId?: number;
    thumbIv?: string;
};

const LS_ATT = "e2ee:att:secrets";

function readSecretsMap(): Record<string, AttSecret> {
    try { return JSON.parse(localStorage.getItem(LS_ATT) || "{}"); } catch { return {}; }
}
function writeSecretsMap(m: Record<string, AttSecret>) {
    localStorage.setItem(LS_ATT, JSON.stringify(m));
}

export function cacheAttSecrets(secrets: AttSecret[]) {
    if (!secrets?.length) return;
    const m = readSecretsMap();
    for (const s of secrets) m[String(s.id)] = s;
    writeSecretsMap(m);
}
function getSecretById(id: number): AttSecret | undefined {
    const m = readSecretsMap(); return m[String(id)];
}
function getSecretsFor(ids: number[] | undefined): AttSecret[] {
    if (!ids?.length) return [];
    const m = readSecretsMap();
    return ids.map(id => m[String(id)]).filter(Boolean) as AttSecret[];
}

export type StoredAccount = {
    token: string;
    userId: number;
    name?: string;
    login?: string;
    avatarUrl?: string | null;
};
export type MeDto = { id: number; name: string; email: string; avatarUrl?: string | null };

export type LoginResp = { token: string; userId: number; login: string; name: string; avatarUrl?: string | null };
export type RegisterResp = { token: string; userId: number; login: string; name: string; email?: string | null; avatarUrl?: string | null };

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

let token: string | null = null;
export function setToken(t: string | null) { token = t; }

export const authFetch: typeof fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    const bearer = token || localStorage.getItem("token");
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    return fetch(input as any, { ...init, headers, credentials: "include" });
};

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(await res.text());
    return res.status === 204 ? (undefined as any) : res.json();
}

export const api = {
    //  вход по ЛОГИНУ
    async login(login: string, password: string): Promise<LoginResp> {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    //  регистрация с логином
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

    sendMessage: (chatId: number, text: string, attachments?: number[] | undefined, opponentUserId?: number | null | undefined) =>
        (async () => {
            let payload = text;

            if (opponentUserId) {
                const attSecrets = getSecretsFor(attachments);
                const body = attSecrets.length ? JSON.stringify({ t: text, att: attSecrets }) : text;

                try {
                    // для адресата
                    const forOpp = await encryptForUser(opponentUserId, body, authFetch);
                    // для себя
                    const myId = Number(localStorage.getItem("userId"));
                    const forMe = await encryptForUser(myId, body, authFetch);

                    payload = packDual({ v: "e2ee:dual1", to: forOpp, me: forMe });
                } catch (e) {
                    console.error("E2EE encrypt failed", e);
                }
            }

            return http(`/messages`, { method: "POST", body: JSON.stringify({ chatId, text: payload, attachments }) });
        })(),

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
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith("e2ee:")) localStorage.removeItem(k);
        }
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

export async function postLoginInit(userId?: number) {
    await initAfterLogin(authFetch, userId);
    await selfTestE2EE(authFetch);
}

// ——— Загрузка с прогрессом ———
export async function uploadWithProgress(
    file: File,
    onProgress?: (p: number) => void
): Promise<{ id: number; url?: string; thumbUrl?: string }> {

    const bearer = token || localStorage.getItem("token");

    return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/attachments`, true);
        if (bearer) xhr.setRequestHeader("Authorization", `Bearer ${bearer}`);

        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && onProgress) {
                const p = Math.max(0, Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
                onProgress(p);
            }
        };

        xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4) return;

            if (xhr.status >= 200 && xhr.status < 300) {
                const txt = xhr.responseText?.trim() || "";
                if (!txt) { resolve({ id: NaN }); return; }
                try { resolve(JSON.parse(txt)); }
                catch { reject(new Error("Bad JSON from /attachments")); }
            } else {
                const msg = xhr.responseText || `HTTP ${xhr.status}`;
                console.error("upload failed:", msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Upload aborted"));

        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
    });
}

export async function uploadEncryptedWithProgress(
    file: File,
    onProgress?: (p: number) => void
): Promise<{ id: number; url?: string }> {
    const buf = await file.arrayBuffer();

    const keyB64 = randKeyB64(32);
    const ivB64 = randIvB64();

    const ct = await aesGcmEncryptToBlob(keyB64, ivB64, buf);
    const form = new FormData();
    form.append("file", new Blob([ct], { type: "application/octet-stream" }), file.name + ".enc");

    let thumbId: number | undefined;
    let thumbIvB64: string | undefined;
    if (file.type.startsWith("image/")) {
        try {
            const thumbBlob = await makeImageThumbBlob(file, 512);
            thumbIvB64 = randIvB64();
            const thumbCt = await aesGcmEncryptToBlob(keyB64, thumbIvB64, await thumbBlob.arrayBuffer());
            const formThumb = new FormData();
            formThumb.append("file", new Blob([thumbCt], { type: "application/octet-stream" }), file.name + ".thumb.enc");
            const resT = await fetch(`${API}/attachments`, { method: "POST", body: formThumb, credentials: "include" });
            if (!resT.ok) throw new Error(await resT.text());
            const jT = await resT.json();
            thumbId = jT.id;
        } catch (e) {
            console.warn("thumb gen/upload failed", e);
        }
    }

    const id = await new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/attachments`, true);
        const bearer = (typeof localStorage !== "undefined" && (localStorage.getItem("token"))) || null;
        if (bearer) xhr.setRequestHeader("Authorization", `Bearer ${bearer}`);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onreadystatechange = () => {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText).id); } catch { reject(new Error("bad JSON from /attachments")); }
            } else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.send(form);
    });

    const secret: AttSecret = {
        id, k: keyB64, iv: ivB64,
        mime: file.type || "application/octet-stream",
        name: file.name, size: file.size,
        sha256: await sha256(buf),
        ...(thumbId ? { thumbId, thumbIv: thumbIvB64! } : {})
    };
    cacheAttSecrets([secret]);

    return { id };
}

export async function maybeDecryptMessage(senderId: number, text: string): Promise<string> {
    // быстрый выход: не шифротекст — не трогаем
    if (!text || (!text.startsWith("E2EE1:") && !text.startsWith("E2EED1:"))) return text;

    try {
        const dual = unpackDual(text);
        if (dual) {
            // если сообщение моё — сначала пробуем ветку "me", иначе "to"
            const myId = Number(localStorage.getItem("userId"));
            const halves = senderId === myId ? [dual.me, dual.to] : [dual.to, dual.me];

            for (const wrapped of halves) {
                try {
                    const pt = await tryDecryptFrom(senderId, wrapped, authFetch);
                    if (!pt) continue;

                    // возможно внутри JSON с секретами вложений
                    if (pt.startsWith("{")) {
                        try {
                            const obj = JSON.parse(pt);
                            if (obj?.att && Array.isArray(obj.att)) cacheAttSecrets(obj.att as AttSecret[]);
                            if (typeof obj?.t === "string") return obj.t;
                        } catch { /* ignore json */ }
                    }
                    return pt;
                } catch { /* попробуем вторую половину */ }
            }

            // обе половины не подошли
            return "🔒 Сообщение зашифровано (не удалось расшифровать)";
        }

        // Обычный E2EE1
        const pt = await tryDecryptFrom(senderId, text, authFetch);
        if (!pt) return "🔒 Сообщение зашифровано (не удалось расшифровать)";

        if (pt.startsWith("{")) {
            try {
                const obj = JSON.parse(pt);
                if (obj?.att && Array.isArray(obj.att)) cacheAttSecrets(obj.att as AttSecret[]);
                if (typeof obj?.t === "string") return obj.t;
            } catch { /* ignore */ }
        }
        return pt;
    } catch (e) {
        console.warn("E2EE decrypt failed", e);
        return "🔒 Сообщение зашифровано (не удалось расшифровать)";
    }
}


async function sha256(ab: ArrayBuffer): Promise<string> {
    const h = await crypto.subtle.digest("SHA-256", ab);
    return btoa(String.fromCharCode(...new Uint8Array(h)));
}
function b64(a: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(a)));
}
function b64d(s: string): ArrayBuffer {
    const bin = atob(s); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
}
async function importRawAes(keyB64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", b64d(keyB64), "AES-GCM", false, ["encrypt", "decrypt"]);
}
function randKeyB64(bytes = 32): string {
    const u = new Uint8Array(bytes); crypto.getRandomValues(u);
    return btoa(String.fromCharCode(...u));
}
function randIvB64(): string {
    const u = new Uint8Array(12); crypto.getRandomValues(u);
    return btoa(String.fromCharCode(...u));
}
async function aesGcmEncryptToBlob(keyB64: string, ivB64: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    const key = await importRawAes(keyB64);
    const iv = new Uint8Array(b64d(ivB64));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
}
async function aesGcmDecryptToArrayBuffer(keyB64: string, ivB64: string, data: ArrayBuffer): Promise<ArrayBuffer> {
    const key = await importRawAes(keyB64);
    const iv = new Uint8Array(b64d(ivB64));
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}

async function makeImageThumbBlob(file: File, maxSide = 512): Promise<Blob> {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; img.src = url; });
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    return new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/jpeg", 0.82));
}

export async function fetchAndDecryptAttachment(id: number): Promise<Blob> {
    const url = `${API}/attachments/${id}`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error(await res.text());
    const ct = await res.arrayBuffer();

    const sec = getSecretById(id);
    // если секретов нет — файл, видимо, не шифровали
    if (!sec) return new Blob([ct], { type: "application/octet-stream" });

    const pt = await aesGcmDecryptToArrayBuffer(sec.k, sec.iv, ct);
    return new Blob([pt], { type: sec.mime || "application/octet-stream" });
}

export async function fetchAndDecryptThumb(id: number): Promise<Blob | null> {
    const sec = getSecretById(id);
    if (!sec?.thumbId || !sec.thumbIv) return null;

    const url = `${API}/attachments/${sec.thumbId}`;
    const res = await authFetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const ct = await res.arrayBuffer();
    const pt = await aesGcmDecryptToArrayBuffer(sec.k, sec.thumbIv, ct);
    return new Blob([pt], { type: "image/jpeg" });
}

const E2EE_DUAL_PREFIX = "E2EED1:";

type DualV1 = {
    v: "e2ee:dual1";
    to: string;   // E2EE1:...  для собеседника
    me: string;   // E2EE1:...  для меня
};

function packDual(x: DualV1) {
    return E2EE_DUAL_PREFIX + btoa(JSON.stringify(x));
}
function unpackDual(s: string): DualV1 | null {
    if (!s?.startsWith(E2EE_DUAL_PREFIX)) return null;
    try { return JSON.parse(atob(s.slice(E2EE_DUAL_PREFIX.length))); } catch { return null; }
}
