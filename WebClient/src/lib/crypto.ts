// Базовые утилиты AES-GCM в WebCrypto
export async function genKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt","decrypt"]);
}
export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt","decrypt"]);
}
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key);
}
export function b64(a: ArrayBuffer) {
    return btoa(String.fromCharCode(...new Uint8Array(a)));
}
export function b64d(s: string) {
    const bin = atob(s); const u8 = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
}
export async function encrypt(key: CryptoKey, data: ArrayBuffer, aad?: ArrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, data);
    return { iv: b64(iv), ct: b64(ct) };
}
export async function decrypt(key: CryptoKey, iv_b64: string, ct_b64: string, aad?: ArrayBuffer) {
    const iv = new Uint8Array(b64d(iv_b64));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, b64d(ct_b64));
    return pt;
}
