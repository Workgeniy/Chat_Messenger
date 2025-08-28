// src/lib/authStore.ts
export type StoredAccount = {
    token: string;
    userId: number;
    name: string;
    avatarUrl?: string | null;
};

// активный пользователь — на УРОВНЕ ВКЛАДКИ
const ACTIVE_KEY = "activeUserId"; // sessionStorage
const ACCOUNTS_KEY = "accounts";   // localStorage

export function loadAuthFromStorage(): StoredAccount | null {
    const activeId = sessionStorage.getItem(ACTIVE_KEY);
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!activeId || !raw) return null;
    const map = JSON.parse(raw) as Record<string, StoredAccount>;
    return map[activeId] ?? null;
}

export function saveAuthToStorage(acc: StoredAccount) {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, StoredAccount>) : {};
    map[String(acc.userId)] = acc;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(map));
    sessionStorage.setItem(ACTIVE_KEY, String(acc.userId));
}

export function logoutThisTab() {
    sessionStorage.removeItem(ACTIVE_KEY);
}
