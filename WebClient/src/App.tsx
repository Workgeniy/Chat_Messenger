import { useEffect, useMemo, useRef, useState } from "react";
import { LoginForm } from "./components/LoginForm/LoginForm";
import { RegisterForm } from "./components/LoginForm/RegisterForm.tsx";
import { ChatList } from "./components/ChatList/ChatList";
import { ChatWindow } from "./components/ChatWindow/ChatWindow";
import type { Msg } from "./components/ChatWindow/ChatWindow";
import type { Chat } from "./lib/api";
import { api, setToken, uploadWithProgress } from "./lib/api";
import { createHub } from "./lib/hub";
import ProfilePanel from "./components/Profile/ProfilePanel.tsx";
import AvatarMenu from "./components/Users/AvatarMenu";
import SearchUsersModal from "./components/Users/SearchUsersModal";
import {saveAuthToStorage, loadAuthFromStorage, logoutThisTab, type StoredAccount} from "./lib/authStore";

export default function App() {
    const [auth, setAuth] = useState<StoredAccount | null>(null);
    const [chats, setChats] = useState<Chat[]>([]);
    const [active, setActive] = useState<number | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [typing, setTyping] = useState<string[]>([]);
    const typingTimersRef = useRef<Map<string, any>>(new Map());
    const [showProfile, setShowProfile] = useState(false);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");
    const [showSearch, setShowSearch] = useState(false);

    const activeChat = chats.find((c) => c.id === active) ?? null;

    // ВОССТАНОВЛЕНИЕ: только через нашу прослойку accounts + activeUserId
    useEffect(() => {
        const acc = loadAuthFromStorage();
        if (acc) {
            setToken(acc.token);
            setAuth(acc);
        }
    }, []);

    // Hub использует токен только из auth
    const hub = useMemo(() => createHub(() => auth?.token ?? null), [auth]);

    // После логина/восстановления — стартуем hub и тянем чаты
    useEffect(() => {
        if (!auth) return;
        setToken(auth.token);
        (async () => {
            await hub.start();
            const list = await api.myChats();
            setChats(list);
        })();
    }, [auth]);

    // Входящие сообщения
    useEffect(() => {
        const handler = (m: any) => {
            if (m.chatId === active) setMsgs((prev) => [...prev, m]);
        };
        hub.onMessage(handler);
        return () => hub.offMessage(handler);
    }, [active, hub]);

    useEffect(() => {
        const onPresence = () => { api.myChats().then(setChats).catch(() => {}); };
        hub.connection.on("PresenceChanged", onPresence);
        return () => hub.connection.off("PresenceChanged", onPresence);
    }, [hub]);

    // Индикатор «печатает…» — НЕ показываем для себя
    useEffect(() => {
        const timers = typingTimersRef.current;
        const handler = (p: { chatId: number; userId: number; displayName?: string }) => {
            if (p.chatId !== active) return;
            if (p.userId === auth?.userId) return; // фильтр самого себя
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

    async function openChat(id: number) {
        setActive(id);
        await hub.joinChat(id);
        const data = await api.messages(id);
        setMsgs(data);
        setCursor(data.length ? data[0].sentUtc : undefined);
    }

    async function loadOlder() {
        if (!active || !cursor) return;
        const older = await api.messages(active, cursor);
        if (!older.length) return;
        setMsgs((prev) => [...older, ...prev]);
        setCursor(older[0].sentUtc);
    }

    async function send(text: string, attachments?: number[]) {
        if (!active) return;
        await api.sendMessage(active, text, attachments && attachments.length ? attachments : undefined);
    }

    async function upload(file: File, onProgress?: (p: number) => void) {
        return uploadWithProgress(file, onProgress);
    }

    const pingTyping = () => {
        if (active) void hub.typing(active);
    };

    function doLogout() {
        logoutThisTab();     // выходим только из ЭТОЙ вкладки
        setToken(null);
        setAuth(null);
        location.reload();
    }

    if (!auth) {
        return (
            <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
                <LoginForm
                    onLogin={(token, userId, name) => {
                        const acc = { token, userId, name };
                        setToken(token);
                        saveAuthToStorage(acc);
                        setAuth(acc);
                    }}
                    onSwitchToRegister={() => setAuthMode("register")}
                />
            </div>
        );
    }

    // ——— Основной UI ———
    return (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "100vh" }}>
            {/* Аватар + меню */}
            <div style={{ position: "fixed", top: 10, left: 10, zIndex: 60 }}>
                <AvatarMenu
                    name={auth.name}
                    onProfile={() => setShowProfile(true)}
                    onSearch={() => setShowSearch(true)}
                    onNewChat={() => setShowSearch(true)}
                    onLogout={doLogout}
                />
            </div>

            {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}

            {showSearch && (
                <SearchUsersModal
                    currentUserId={auth.userId}
                    onClose={() => setShowSearch(false)}
                    onPick={async (chat) => {
                        // апсертим чат в стейт
                        setChats(prev => {
                            const i = prev.findIndex(c => c.id === chat.id);
                            if (i === -1) return [chat, ...prev];
                            const copy = [...prev]; copy[i] = { ...copy[i], ...chat }; return copy;
                        });
                        await openChat(chat.id);
                        setShowSearch(false);
                    }}
                />
            )}

            <ChatList items={chats} activeId={active} onOpen={openChat} />

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
