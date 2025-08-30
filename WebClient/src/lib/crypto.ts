
let CURRENT_UID: number | null = null;
export function setActiveE2EEUser(userId: number) { CURRENT_UID = userId; }

// LS-неймспейсы
const LS_BASE = {
    privEcdh: "priv:ecdh:jwk",
    privSign: "priv:sign:jwk",
    pubEcdh:  "pub:ecdh:jwk",
    pubSign:  "pub:sign:jwk",
    pubCached:"cache:pubkeys",
    meKeysUploaded: "me:uploaded",
    tofuFingerprints: "tofu:fingerprints",
};
function NS(key: keyof typeof LS_BASE) {
    const uid = CURRENT_UID ?? "anon";
    return `e2ee:u:${uid}:${LS_BASE[key]}`;
}

export type PublicKeys = { ecdhPubJwk: JsonWebKey; signPubJwk: JsonWebKey };

function K_privEcdh() { return NS("privEcdh"); }
function K_privSign() { return NS("privSign"); }
function K_pubEcdh()  { return NS("pubEcdh"); }
function K_pubSign()  { return NS("pubSign"); }
function K_pubCached(){ return NS("pubCached"); }
function K_meUploaded(){ return NS("meKeysUploaded"); }
function K_tofu()     { return NS("tofuFingerprints"); }
const subtle = crypto.subtle;

// b64 utils
export function b64(a: ArrayBuffer): string { return btoa(String.fromCharCode(...new Uint8Array(a))); }
export function b64d(s: string): ArrayBuffer {
    const bin = atob(s); const u8 = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
}
function ub64(s: string): Uint8Array { return new Uint8Array(b64d(s)); }
function enc(s: string): Uint8Array { return new TextEncoder().encode(s); }
function dec(a: ArrayBuffer): string { return new TextDecoder().decode(a); }

// канонический JSON для подписи
function canonicalStringify(obj: any): string {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalStringify((obj as any)[k])).join(",") + "}";
}

// импорт JWK
async function importJwk(
    jwk: JsonWebKey,
    algo: EcKeyImportParams | HmacImportParams | RsaHashedImportParams | AesKeyGenParams,
    usages: KeyUsage[]
): Promise<CryptoKey> {
    return crypto.subtle.importKey("jwk", jwk, algo as any, true, usages as any);
}

/* =========================
   Формат шифротекста и E2EE функции
   ========================= */

export type CipherV1 = {
    v: "e2ee:v1";
    ephPubJwk: JsonWebKey;   // эфемерный ECDH pubkey
    iv: string;              // base64(12)
    ct: string;              // base64
    sig: string;             // base64(ECDSA)
    senderSignPubJwk?: JsonWebKey; // ПУБЛИЧНЫЙ КЛЮЧ ПОДПИСИ ОТПРАВИТЕЛЯ (вложен)
};

export async function encryptForUser(
    recipientUserId: number,
    plaintext: string,
    fetchAuth: typeof fetch
): Promise<string> {
    // 1) ключ получателя
    const {ecdhPubJwk} = await getRecipientPublicKeys(recipientUserId, fetchAuth);
    const recipientPub = await importJwk(ecdhPubJwk, {name: "ECDH", namedCurve: "P-256"}, []);

    // 2) эфемерная пара и общий ключ
    const eph = await subtle.generateKey(
        {name: "ECDH", namedCurve: "P-256"},
        true,
        ["deriveKey", "deriveBits"]
    ) as CryptoKeyPair;

    const aesKey = await subtle.deriveKey(
        {name: "ECDH", public: recipientPub},
        eph.privateKey,
        {name: "AES-GCM", length: 256},
        true,
        ["encrypt"]
    );

    // 3) шифруем
    const ivU8 = crypto.getRandomValues(new Uint8Array(12));
    const ctBuf = await subtle.encrypt({name: "AES-GCM", iv: ivU8}, aesKey, enc(plaintext));

    // 4) подписываем
    const signPrivJwk = JSON.parse(localStorage.getItem(K_privSign())!);
    const signPrivKey = await importJwk(signPrivJwk, {name: "ECDSA", namedCurve: "P-256"}, ["sign"]);
    const ephPubJwk = await subtle.exportKey("jwk", eph.publicKey);

    const payloadToSign = new Uint8Array([
        ...enc("e2ee:v1"),
        ...enc(canonicalStringify(ephPubJwk)),
        ...ivU8,
        ...new Uint8Array(ctBuf),
    ]);
    const sigBuf = await subtle.sign({name: "ECDSA", hash: "SHA-256"}, signPrivKey, payloadToSign);

    // 5) вложим наш публичный ключ подписи (важно для верификации старых сообщений)
    const senderSignPubJwk = JSON.parse(localStorage.getItem(K_pubSign())!);
    const out: CipherV1 = { v:"e2ee:v1", ephPubJwk, iv:b64(ivU8.buffer), ct:b64(ctBuf), sig:b64(sigBuf), senderSignPubJwk };
    return "E2EE1:" + btoa(JSON.stringify(out));

}
// Попытка расшифровать входящее сообщение от senderUserId
export async function tryDecryptFrom(
    senderUserId: number,
    wrapped: string,
    fetchAuth: typeof fetch
): Promise<string | null> {
    if (!wrapped?.startsWith("E2EE1:")) return null;

    const obj: CipherV1 = JSON.parse(atob(wrapped.slice(6)));
    if (obj.v !== "e2ee:v1") return null;

    // 1) ПОДПИСЬ: сначала ключ из конверта (если есть), затем — «текущий» с сервера
    const tryVerify = async (jwk: JsonWebKey | null) => {
        if (!jwk) return false;
        const key = await importJwk(jwk, { name: "ECDSA", namedCurve: "P-256" }, ["verify"]);
        const payload = new Uint8Array([
            ...enc("e2ee:v1"),
            ...enc(canonicalStringify(obj.ephPubJwk)),
            ...ub64(obj.iv),
            ...ub64(obj.ct),
        ]);
        return await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, ub64(obj.sig), payload);
    };

    const embedded = obj.senderSignPubJwk ?? null;
    let verified = await tryVerify(embedded);
    if (!verified) {
        const { signPubJwk } = await getRecipientPublicKeys(senderUserId, fetchAuth);
        verified = await tryVerify(signPubJwk);
        if (!verified) throw new Error("Signature invalid");
    }

    // 2) ДЕКРИПТ
    const myPrivEcdhJwk = JSON.parse(localStorage.getItem(K_privEcdh())!);
    const myPrivEcdh = await importJwk(myPrivEcdhJwk, { name: "ECDH", namedCurve: "P-256" }, ["deriveKey","deriveBits"]);
    const ephPub = await importJwk(obj.ephPubJwk, { name: "ECDH", namedCurve: "P-256" }, []);
    const aesKey = await subtle.deriveKey(
        { name: "ECDH", public: ephPub },
        myPrivEcdh as CryptoKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["decrypt"]
    );

    const ptBuf = await subtle.decrypt({ name: "AES-GCM", iv: ub64(obj.iv) }, aesKey, b64d(obj.ct));
    return dec(ptBuf);
}

/* =========================
   Базовые AES-GCM утилиты
   ========================= */

export async function genKey(): Promise<CryptoKey> {
    return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt","decrypt"]);
}
export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
    return subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt","decrypt"]);
}
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return subtle.exportKey("raw", key);
}
export async function encrypt(key: CryptoKey, data: ArrayBuffer, aad?: ArrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: "AES-GCM", iv, ...(aad ? { additionalData: aad } : {}) }, key, data);
    return { iv: b64(iv.buffer), ct: b64(ct) };
}
export async function decrypt(key: CryptoKey, iv_b64: string, ct_b64: string, aad?: ArrayBuffer) {
    const iv = new Uint8Array(b64d(iv_b64));
    const pt = await subtle.decrypt({ name: "AES-GCM", iv, ...(aad ? { additionalData: aad } : {}) }, key, b64d(ct_b64));
    return pt;
}

/* =========================
   Управление ключами пользователя
   ========================= */

export async function ensureIdentityKeysUploaded(fetchAuth: typeof fetch): Promise<void> {
    let privEcdh = localStorage.getItem(K_privEcdh());
    let privSign = localStorage.getItem(K_privSign());
    let pubEcdh  = localStorage.getItem(K_pubEcdh());
    let pubSign  = localStorage.getItem(K_pubSign());

    if (!privEcdh || !privSign || !pubEcdh || !pubSign) {
        const ecdhPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey","deriveBits"]) as CryptoKeyPair;
        const signPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign","verify"]) as CryptoKeyPair;

        const [privEcdhJwk, privSignJwk, pubEcdhJwk, pubSignJwk] = await Promise.all([
            subtle.exportKey("jwk", ecdhPair.privateKey),
            subtle.exportKey("jwk", signPair.privateKey),
            subtle.exportKey("jwk", ecdhPair.publicKey),
            subtle.exportKey("jwk", signPair.publicKey),
        ]);

        localStorage.setItem(K_privEcdh(), JSON.stringify(privEcdhJwk));
        localStorage.setItem(K_privSign(), JSON.stringify(privSignJwk));
        localStorage.setItem(K_pubEcdh(),  JSON.stringify(pubEcdhJwk));
        localStorage.setItem(K_pubSign(),  JSON.stringify(pubSignJwk));

        privEcdh = JSON.stringify(privEcdhJwk);
        privSign = JSON.stringify(privSignJwk);
        pubEcdh  = JSON.stringify(pubEcdhJwk);
        pubSign  = JSON.stringify(pubSignJwk);
    }

    if (!localStorage.getItem(K_meUploaded())) {
        const res = await fetchAuth("/api/users/me/keys", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ecdhPublicJwk: pubEcdh!, signPublicJwk: pubSign! })
        });
        if (!res.ok) throw new Error(await res.text());
        localStorage.setItem(K_meUploaded(), "1");
    }
}

// запускать сразу после логина
export async function initAfterLogin(fetchAuth: typeof fetch, userId?: number) {
    if (userId) setActiveE2EEUser(userId);
    await ensureIdentityKeysUploaded(fetchAuth);
}

export async function selfTestE2EE(fetchAuth: typeof fetch) {
    try {
        const myId = Number(localStorage.getItem("userId"));
        const msg = "selftest:" + Math.random().toString(36).slice(2, 8);
        const c = await encryptForUser(myId, msg, fetchAuth);
        const pt = await tryDecryptFrom(myId, c, fetchAuth);
        if (pt !== msg) throw new Error("self-test mismatch");
    } catch (e) {
        console.error("E2EE self-test failed:", e);
    }
}

/* =========================
   TOFU / ключи контактов
   ========================= */

type TofuRecord = { fp: string; firstSeen: string; lastSeen: string; prevFp?: string; changed?: boolean };

function readTofuMap(tofuKey: string): Record<string, TofuRecord> {
    try { return JSON.parse(localStorage.getItem(tofuKey) || "{}"); } catch { return {}; }
}
function writeTofuMap(tofuKey: string, m: Record<string, TofuRecord>) {
    localStorage.setItem(tofuKey, JSON.stringify(m));
}

async function sha256b64(ab: ArrayBuffer): Promise<string> {
    const d = await subtle.digest("SHA-256", ab);
    return b64(d);
}
async function fingerprintKeys(ecdhPubJwk: JsonWebKey, signPubJwk: JsonWebKey): Promise<string> {
    const s = canonicalStringify({ ecdhPubJwk, signPubJwk });
    return await sha256b64(enc(s));
}

async function pinOrUpdateTofu(userId: number, ecdhPubJwk: JsonWebKey, signPubJwk: JsonWebKey) {
    const fp = await fingerprintKeys(ecdhPubJwk, signPubJwk);
    const k = K_tofu();
    const map = readTofuMap(k);
    const key = String(userId);
    const now = new Date().toISOString();

    const rec = map[key];
    if (!rec) {
        map[key] = { fp, firstSeen: now, lastSeen: now };
        writeTofuMap(k, map);
    } else if (rec.fp !== fp) {
        const oldFp = rec.fp;
        map[key] = { fp, firstSeen: rec.firstSeen, lastSeen: now, prevFp: oldFp, changed: true };
        writeTofuMap(k, map);
        window.dispatchEvent(new CustomEvent("e2ee:keychange", { detail: { userId, oldFp, newFp: fp } }));
    } else {
        rec.lastSeen = now;
        writeTofuMap(k, map);
    }
}

export function getPinnedFingerprint(userId: number): TofuRecord | null {
    const m = readTofuMap(K_tofu()); return m[String(userId)] ?? null;
}
export function forgetPinnedFingerprint(userId: number) {
    const k = K_tofu(); const m = readTofuMap(k); delete m[String(userId)]; writeTofuMap(k, m);
}

// Получение ключей контакта с кэшем и возможностью принудительного обновления
export async function getRecipientPublicKeys(
    userId: number,
    fetchAuth: typeof fetch,
    opts?: { force?: boolean }
): Promise<PublicKeys> {
    const force = !!opts?.force;
    const kCache = K_pubCached();
    const cache: Record<string, PublicKeys> = (() => { try { return JSON.parse(localStorage.getItem(kCache) || "{}"); } catch { return {}; } })();

    if (!force && cache[userId]) {
        await pinOrUpdateTofu(userId, cache[userId].ecdhPubJwk, cache[userId].signPubJwk);
        return cache[userId];
    }

    const res = await fetchAuth(`/api/users/${userId}/keys`);
    if (!res.ok) throw new Error("No recipient keys");
    const dto = await res.json();

    const ecdhPubJwk = JSON.parse(dto.ecdhPublicJwk);
    const signPubJwk = JSON.parse(dto.signPublicJwk);

    await pinOrUpdateTofu(userId, ecdhPubJwk, signPubJwk);

    cache[userId] = { ecdhPubJwk, signPubJwk };
    localStorage.setItem(kCache, JSON.stringify(cache));
    return cache[userId];
}

/* =========================
   Ротация/сброс
   ========================= */

export function resetMyE2EEStorage() {
    const uid = Number(localStorage.getItem("userId")) || "anon";
    const keys = [
        `e2ee:u:${uid}:cache:pubkeys`,
        `e2ee:u:${uid}:tofu:fingerprints`,
        `e2ee:u:${uid}:me:uploaded`,
        `e2ee:u:${uid}:priv:ecdh:jwk`,
        `e2ee:u:${uid}:priv:sign:jwk`,
        `e2ee:u:${uid}:pub:ecdh:jwk`,
        `e2ee:u:${uid}:pub:sign:jwk`,
        // на всякий случай чистим «anon»-неймспейс
        `e2ee:u:anon:cache:pubkeys`,
        `e2ee:u:anon:tofu:fingerprints`,
        `e2ee:u:anon:me:uploaded`,
        `e2ee:u:anon:priv:ecdh:jwk`,
        `e2ee:u:anon:priv:sign:jwk`,
        `e2ee:u:anon:pub:ecdh:jwk`,
        `e2ee:u:anon:pub:sign:jwk`,
    ];
    keys.forEach(k => localStorage.removeItem(k));
}

export async function reinstallMyKeys(fetchAuth: typeof fetch, userId?: number) {
    const uid = userId ?? Number(localStorage.getItem("userId"));
    setActiveE2EEUser(uid);
    resetMyE2EEStorage();
    await ensureIdentityKeysUploaded(fetchAuth);
    await selfTestE2EE(fetchAuth); // sanity-check
}

export async function forceRefreshRecipientKeys(contactUserId: number, fetchAuth: typeof fetch) {
    const kCache = K_pubCached();
    const cache = JSON.parse(localStorage.getItem(kCache) || "{}");
    delete cache[String(contactUserId)];
    localStorage.setItem(kCache, JSON.stringify(cache));

    const kTofu = K_tofu();
    const tofu = JSON.parse(localStorage.getItem(kTofu) || "{}");
    delete tofu[String(contactUserId)];
    localStorage.setItem(kTofu, JSON.stringify(tofu));

    await getRecipientPublicKeys(contactUserId, fetchAuth, { force: true });
}

/* =========================
   UX helpers
   ========================= */
export function formatSafetyCode(fp: string): string {
    const short = fp.replace(/=+$/,'').slice(0,32);
    return short.match(/.{1,4}/g)?.join(" ") ?? short;
}
