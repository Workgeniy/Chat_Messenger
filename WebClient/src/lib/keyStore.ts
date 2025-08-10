
import { genKey, exportKey, importKey, b64, b64d } from "./crypto";

const PREFIX = "chat_key_";
export async function getOrCreateChatKey(chatId: number): Promise<CryptoKey> {
    const k = localStorage.getItem(PREFIX + chatId);
    if (k) return importKey(b64d(k));
    const key = await genKey();
    localStorage.setItem(PREFIX + chatId, b64(await exportKey(key)));
    return key;
}
export function exportChatKeyBase64(chatId: number): string | null {
    return localStorage.getItem(PREFIX + chatId);
}
export async function importChatKeyBase64(chatId: number, keyB64: string) {
    // валидация размера не помешает
    localStorage.setItem(PREFIX + chatId, keyB64);
}
