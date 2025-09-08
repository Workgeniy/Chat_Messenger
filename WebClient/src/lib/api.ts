import {
    initAfterLogin,
    encryptForUser,
    tryDecryptFrom,
    selfTestE2EE, encryptForGroup,
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

// ====== Групповой формат и расшифровка ======
const E2EE_GROUP_PREFIX = "E2EEG1:";
type GroupEnvelope = { uid: number; box: string };
type GroupV1 = { v: "e2ee:group1"; env: GroupEnvelope[] };

function unpackGroup(s: string): GroupV1 | null {
    if (!s?.startsWith(E2EE_GROUP_PREFIX)) return null;
    try { return JSON.parse(atob(s.slice(E2EE_GROUP_PREFIX.length))); } catch { return null; }
}


async function tryDecryptGroup(
    senderUserId: number,
    wrapped: string
): Promise<string | null> {
    const g = unpackGroup(wrapped);
    if (!g) return null;

    const myId = Number(localStorage.getItem("userId"));
    const mine = g.env.find(e => e.uid === myId);
    const candidates = mine ? [mine, ...g.env.filter(e => e !== mine)] : g.env;

    for (const e of candidates) {
        try {
            const pt = await tryDecryptFrom(senderUserId, e.box, authFetch);
            if (pt) return pt;
        } catch { /* пробуем следующий */ }
    }
    return null;
}

// Главная функция: расшифровать или вернуть плейнтекст
export async function maybeDecryptMessage(senderId: number, text: string): Promise<string> {
    if (!text || (!text.startsWith("E2EE1:") && !text.startsWith("E2EED1:") && !text.startsWith("E2EEG1:"))) {
        return text;
    }

    try {
        // 1) Группа
        if (text.startsWith(E2EE_GROUP_PREFIX)) {
            const pt = await tryDecryptGroup(senderId, text);
            if (!pt) return "🔒 Сообщение зашифровано (не удалось расшифровать)";
            if (pt.startsWith("{")) {
                try {
                    const obj = JSON.parse(pt);
                    if (obj?.att && Array.isArray(obj.att)) cacheAttSecrets(obj.att);
                    if (typeof obj?.t === "string") return obj.t;
                } catch {}
            }
            return pt;
        }

        // 2) Dual 1:1
        const dual = unpackDual(text);
        if (dual) {
            const myId = Number(localStorage.getItem("userId"));
            const halves = senderId === myId ? [dual.me, dual.to] : [dual.to, dual.me];
            for (const wrapped of halves) {
                try {
                    const pt = await tryDecryptFrom(senderId, wrapped, authFetch);
                    if (!pt) continue;
                    if (pt.startsWith("{")) {
                        try {
                            const obj = JSON.parse(pt);
                            if (obj?.att && Array.isArray(obj.att)) cacheAttSecrets(obj.att);
                            if (typeof obj?.t === "string") return obj.t;
                        } catch {}
                    }
                    return pt;
                } catch {}
            }
            return "🔒 Сообщение зашифровано (не удалось расшифровать)";
        }

        // 3) Обычный E2EE1
        const pt = await tryDecryptFrom(senderId, text, authFetch);
        if (!pt) return "🔒 Сообщение зашифровано (не удалось расшифровать)";
        if (pt.startsWith("{")) {
            try {
                const obj = JSON.parse(pt);
                if (obj?.att && Array.isArray(obj.att)) cacheAttSecrets(obj.att);
                if (typeof obj?.t === "string") return obj.t;
            } catch {}
        }
        return pt;

    } catch (e) {
        console.warn("E2EE decrypt failed", e);
        return "🔒 Сообщение зашифровано (не удалось расшифровать)";
    }
}

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

export function getAttachmentLocalMeta(id: number): { mime?: string; hasThumb?: boolean } | null {
    const s = getSecretById(id);
    if (!s) return null;
    return { mime: s.mime, hasThumb: !!s.mime && s.mime.startsWith("image/") };
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


// ——— База ———
const API = import.meta.env.VITE_API_BASE ?? "/api";

let token: string | null = null;
export function setToken(t: string | null) { token = t; }



export const authFetch: typeof fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);

    // Content-Type только для НЕ-FormData
    if (!(init.body instanceof FormData)) {
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }

    const bearer = token || localStorage.getItem('token');
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);

    let url: RequestInfo | URL = input;

    if (typeof input === 'string') {
        const s = input;
        const isAbsolute = /^(https?:)?\/\//i.test(s);
        const apiBase = API.replace(/\/$/, '');

        if (!isAbsolute) {
            if (s.startsWith(apiBase)) {
                url = s;                        // уже с /api — не трогаем
            } else if (s.startsWith('/')) {
                url = apiBase + s;              // /xxx  -> /api/xxx
            } else {
                url = `${apiBase}/${s}`;        // xxx   -> /api/xxx
            }
        }
    }

    return fetch(url, { ...init, headers, credentials: 'include' });
};

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const bearer = token || localStorage.getItem("token");
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
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

    // uploadChatAvatar: (chatId: number, file: File) => {
    //     const form = new FormData();
    //     form.append("file", file);
    //     return http<{ avatarUrl: string }>(`/chats/${chatId}/avatar`, { method: "POST", body: form });
    // },

    //  регистрация с логином
    async register(login: string, name: string, email: string | null, password: string): Promise<RegisterResp> {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, name, email, password }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async addChatMembers(chatId: number, userIds: number[]) {
        const bodies = [
            JSON.stringify({ userIds }),
            JSON.stringify({ memberIds: userIds }),
            JSON.stringify({ ids: userIds }),
        ];
        const headers = { 'Content-Type': 'application/json' as const };

        for (const body of bodies) {
            const r = await authFetch(`/chats/${chatId}/members`, { method: 'POST', headers, body });
            if (r.ok) {
                // сервер может вернуть 204 No Content
                try { return await r.json(); } catch { return; }
            }
            if (r.status !== 404 && r.status !== 405) {
                // есть ответ от сервера, но не ОК — покажем его текст
                throw new Error((await r.text().catch(() => 'Ошибка добавления участников')) || `HTTP ${r.status}`);
            }
        }

        for (const body of bodies) {
            const r = await authFetch(`/chats/${chatId}/invite`, { method: 'POST', headers, body });
            if (r.ok) { try { return await r.json(); } catch { return; } }
            if (r.status !== 404 && r.status !== 405) {
                throw new Error((await r.text().catch(() => 'Ошибка добавления участников')) || `HTTP ${r.status}`);
            }
        }

        throw new Error('Эндпоинт добавления участников не найден (404/405)');
    },



    async uploadChatAvatar(chatId: number, file: File) {
        const form = new FormData();
        form.append('file', file);
        form.append('avatar', file);
        const res = await authFetch(`${API}/chats/${chatId}/avatar`, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        return res.json() as Promise<{ avatarUrl: string }>;
    },

    me: () => http<MeDto>("/users/me"),

    myChats() { return http<Chat[]>(`/chats`); },

    messages: (chatId: number, before?: string) =>
        http<Msg[]>(`/messages?chatId=${chatId}${before ? `&before=${before}` : ""}&take=50`),

    sendMessage: (chatId: number, text: string, attachments?: number[] | undefined, opponentUserId?: number | null | undefined) =>
        (async () => {
            let payload = text;

            // соберём секреты вложений, если есть
            const attSecrets = getSecretsFor(attachments);
            const body = attSecrets.length ? JSON.stringify({ t: text, att: attSecrets }) : text;

            if (opponentUserId) {
                // 1:1 (dual) — как было
                try {
                    const forOpp = await encryptForUser(opponentUserId, body, authFetch);
                    const myId = Number(localStorage.getItem("userId"));
                    const forMe = await encryptForUser(myId, body, authFetch);
                    payload = packDual({ v: "e2ee:dual1", to: forOpp, me: forMe });
                } catch (e) {
                    console.error("E2EE encrypt failed (1:1)", e);
                }
            } else {
                // ГРУППА
                try {
                    // получаем актуальный список участников
                    const members = await api.getChatMembers(chatId);
                    const ids = members.map(m => m.id);
                    // обязательно включаем себя (на случай если бэк отдал без нас)
                    const myId = Number(localStorage.getItem("userId"));
                    if (!ids.includes(myId)) ids.push(myId);

                    payload = await encryptForGroup(ids, body, authFetch);
                } catch (e) {
                    console.error("E2EE encrypt failed (group)", e);
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

    removeChatMember: async (chatId: number, userId: number) => {
        const res = await authFetch(`/chats/${chatId}/members/${userId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
        try { return await res.json(); } catch { return; }
    },

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




export async function uploadEncryptedWithProgress(
    file: File,
    onProgress?: (p: number) => void
): Promise<{ id: number; url?: string }> {
    const buf = await file.arrayBuffer();

    const guessMimeFromName = (name: string): string => {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const map: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg',
            png: 'image/png', gif: 'image/gif', webp: 'image/webp',
            heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', svg: 'image/svg+xml',
            mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
            mp3: 'audio/mpeg', wav: 'audio/wav', oga: 'audio/ogg', ogg: 'audio/ogg',
            pdf: 'application/pdf'
        };
        return map[ext] || 'application/octet-stream';
    };
    const effectiveMime = file.type && file.type !== 'application/octet-stream'
        ? file.type
        : guessMimeFromName(file.name);

    const keyB64 = randKeyB64(32);
    const ivB64 = randIvB64();

    const ct = await aesGcmEncryptToBlob(keyB64, ivB64, buf);

    // 1) Загружаем ЗАШИФРОВАННЫЙ файл
    const form = new FormData();
    form.append("file", new Blob([ct], { type: "application/octet-stream" }), file.name + ".enc");

    const up = await authFetch(`/attachments`, { method: "POST", body: form });
      if (!up.ok) throw new Error(await up.text());
      const { id, url } = await up.json() as { id: number; url?: string };

          if (effectiveMime.startsWith("image/")) {
            try {
                const imgThumb = await makeImageThumbBlob(file, 512);
                      const fT = new FormData();
                      fT.append("file", imgThumb, "thumb.jpg");
                      const resT = await authFetch(`/attachments/${id}/thumb`, { method: "POST", body: fT });
                      if (!resT.ok) console.warn("thumb upload failed", await resT.text());
            } catch (e) {
                console.warn("thumb gen/upload failed", e);
            }
        }


          const secret: AttSecret = {
                    id, k: keyB64, iv: ivB64,
                mime: effectiveMime,
                name: file.name,
                size: file.size
          };
        cacheAttSecrets([secret]);

              onProgress?.(100);
          return { id, url };
    }

export async function fetchAndDecryptAttachment(id: number) {
    const r = await authFetch(`/attachments/${id}/content`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const encBlob = await r.blob();
      const s = getSecretById(id);
          if (!s?.k || !s?.iv) return encBlob;
      const ab = await encBlob.arrayBuffer();
      const key = await importRawAes(s.k);
      const iv = new Uint8Array(b64d(s.iv));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ab);
      return new Blob([pt], { type: s.mime || "application/octet-stream" });
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


export async function fetchAndDecryptThumb(id: number) {
    const r = await authFetch(`/attachments/${id}/thumb`);
    if (r.ok) return r.blob();
    return fetchAndDecryptAttachment(id);
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
