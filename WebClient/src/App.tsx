import { useEffect, useMemo, useRef, useState } from "react";

import { LoginForm } from "./components/LoginForm/LoginForm";
import { RegisterForm } from "./components/LoginForm/RegisterForm";
import { ChatList } from "./components/ChatList/ChatList";
import { ChatWindow, type Msg } from "./components/ChatWindow/ChatWindow";
import ProfilePanel from "./components/Profile/ProfilePanel";
import AvatarMenu from "./components/Users/AvatarMenu";
import SearchUsersModal from "./components/Users/SearchUsersModal";

import { api, setToken, uploadWithProgress, type Chat } from "./lib/api";
import { createHub } from "./lib/hub";
import { saveAuthToStorage, loadAuthFromStorage, logoutThisTab, type StoredAccount } from "./lib/authStore";

// ——— APP ———
export default function App() {
    // auth
    const [auth, setAuth] = useState<StoredAccount | null>(null);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");

    // data
    const [chats, setChats] = useState<Chat[]>([]);
    const [active, setActive] = useState<number | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [cursor, setCursor] = useState<string | undefined>(undefined);

    // ui
    const [showProfile, setShowProfile] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [typing, setTyping] = useState<string[]>([]);
    const typingTimersRef = useRef<Map<string, any>>(new Map());

    const activeChat = chats.find((c) => c.id === active) ?? null;

    // восстановление аккаунта только через accounts + activeUserId
    useEffect(() => {
        const acc = loadAuthFromStorage();
        if (acc) {
            setToken(acc.token);
            setAuth(acc);
        }
    }, []);

    // hub использует токен только из auth
    const hub = useMemo(() => createHub(() => auth?.token ?? null), [auth]);

    // после входа — стартуем хаб и тянем чаты
    useEffect(() => {
        if (!auth) return;
        setToken(auth.token);
        (async () => {
            await hub.start();
            const list = await api.myChats();
            setChats(list);
        })();
    }, [auth, hub]);

    useEffect(() => {
        (async () => {
            if (!auth) return;
            try {
                const me = await api.me();
                // обновим имя/аватар локально
                setAuth(a => a ? { ...a, name: me.name, avatarUrl: me.avatarUrl ?? a.avatarUrl } : a);
            } catch { /* no-op */ }
        })();
    }, [auth?.userId]);


    // входящие сообщения
    useEffect(() => {
        const handler = (m: any) => {
            if (m.chatId === active) setMsgs((prev) => [...prev, m]);
        };
        hub.onMessage(handler);
        return () => hub.offMessage(handler);
    }, [active, hub]);

    // индикатор «печатает…» — не показываем для себя
    useEffect(() => {
        const timers = typingTimersRef.current;
        const handler = (p: { chatId: number; userId: number; displayName?: string }) => {
            if (p.chatId !== active) return;
            if (p.userId === auth?.userId) return;
            const name = p.displayName ?? `User#${p.userId}`;
            setTyping((prev) => (prev.includes(name) ? prev : [...prev, name]));
            clearTimeout(timers.get(name));
            timers.set(
                name,
                setTimeout(() => {
                    setTyping((prev) => prev.filter((n) => n !== name));
                    timers.delete(name);
                }, 3000)
            );
        };
        hub.onTyping(handler);
        return () => hub.offTyping(handler);
    }, [active, hub, auth?.userId]);

    // открыть чат: подписаться и загрузить историю
    async function openChat(id: number) {
        setActive(id);
        await hub.joinChat(id);
        const [data, list] = await Promise.all([api.messages(id), api.myChats()]);
        setMsgs(data);
        setChats(list);
        setCursor(data.length ? data[0].sentUtc : undefined);
    }

    // подгрузка истории
    async function loadOlder() {
        if (!active || !cursor) return;
        const older = await api.messages(active, cursor);
        if (!older.length) return;
        setMsgs((prev) => [...older, ...prev]);
        setCursor(older[0].sentUtc);
    }

    // отправка
    async function send(text: string, attachments?: number[]) {
        if (!active) return;
        await api.sendMessage(active, text, attachments && attachments.length ? attachments : undefined);
        // новое сообщение придёт через SignalR
    }

    // загрузка файла
    function upload(file: File, onProgress?: (p: number) => void) {
        return uploadWithProgress(file, onProgress);
    }

    // «печатает»
    const pingTyping = () => {
        if (active) void hub.typing(active);
    };

    // logout — только из текущей вкладки
    function doLogout() {
        logoutThisTab();
        setToken(null);
        setAuth(null);
        location.reload();
    }

    // ——— AUTH SCREENS ———
    if (!auth) {
        return authMode === "login" ? (
            <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
                <LoginForm
                    onLogin={(token, userId, name) => {
                        const acc: StoredAccount = { token, userId, name };
                        setToken(token);
                        saveAuthToStorage(acc);
                        setAuth(acc);
                    }}
                    onSwitchToRegister={() => setAuthMode("register")}
                />
            </div>
        ) : (
            <RegisterForm
                onDone={(token, userId, name) => {
                    const acc: StoredAccount = { token, userId, name };
                    setToken(token);
                    saveAuthToStorage(acc);
                    setAuth(acc);
                }}
                onCancel={() => setAuthMode("login")}
            />
        );
    }

    // ——— MAIN UI ———
    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 34%) 1fr", height: "100vh" }}>
            {/* аватар + меню слева-сверху */}
            <div style={{ position: "fixed", top: 10, left: 10, zIndex: 60 }}>
                <AvatarMenu
                    name={auth.name}
                    avatarUrl={auth.avatarUrl ?? undefined}
                    onProfile={() => setShowProfile(true)}
                    onSearch={() => setShowSearch(true)}
                    onNewChat={() => setShowSearch(true)}
                    onLogout={doLogout}
                />
            </div>

            {/* модалки */}
            {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}

            {showSearch && (
                <SearchUsersModal
                    currentUserId={auth.userId}
                    onClose={() => setShowSearch(false)}
                    onPick={async (chatId) => {
                        setShowSearch(false);
                        // обновим список чатов, чтобы новый точно появился
                        const list = await api.myChats();
                        setChats(list);
                        // и откроем его
                        await openChat(chatId);
                        setChats(await api.myChats());
                    }}
                />
            )}


            {/* список чатов и окно сообщений */}
            <ChatList items={chats} activeId={active} onOpen={openChat} myId={auth.userId} />
            <ChatWindow
                title={activeChat?.title}
                avatarUrl={activeChat?.avatarUrl}
                userId={auth.userId}
                messages={msgs}
                onSend={send}
                onUpload={upload}
                onTyping={pingTyping}
                typingUsers={typing}
                onLoadOlder={loadOlder}
            />
        </div>
    );
}
