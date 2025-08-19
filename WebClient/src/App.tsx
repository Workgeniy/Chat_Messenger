// src/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";

import { LoginForm } from "./components/LoginForm/LoginForm";
import { RegisterForm } from "./components/LoginForm/RegisterForm";
import { ChatList } from "./components/ChatList/ChatList";
import ChatWindow from "./components/ChatWindow/ChatWindow"; // default import
import ProfilePanel from "./components/Profile/ProfilePanel";
import AvatarMenu from "./components/Users/AvatarMenu";
import SearchUsersModal from "./components/Users/SearchUsersModal";
import CreateChatModal from "./components/Chats/CreateChatModal";

import {
    api,
    setToken,
    uploadWithProgress,
    type Chat,
    type Msg,
    type Participant,
} from "./lib/api";
import { createHub } from "./lib/hub";
import {
    saveAuthToStorage,
    loadAuthFromStorage,
    logoutThisTab,
    type StoredAccount,
} from "./lib/authStore";

export default function App() {
    // ---------- AUTH ----------
    const [auth, setAuth] = useState<StoredAccount | null>(null);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");

    // ---------- DATA ----------
    const [chats, setChats] = useState<Chat[]>([]);
    const [active, setActive] = useState<number | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [cursor, setCursor] = useState<string | undefined>(undefined);

    // ---------- UI ----------
    const [showProfile, setShowProfile] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showCreateChat, setShowCreateChat] = useState(false);
    const [members, setMembers] = useState<Participant[]>([]);

    const [typing, setTyping] = useState<string[]>([]);
    const typingTimersRef = useRef<Map<string, any>>(new Map());

    const activeChat = chats.find((c) => c.id === active) ?? null;

    // hub c ленивым токеном
    const hub = useMemo(() => createHub(() => auth?.token ?? null), [auth]);

    // подгрузка участников для активного чата
    useEffect(() => {
        if (!active) { setMembers([]); return; }
        let cancelled = false;
        (async () => {
            try {
                const list = await api.getChatMembers(active);
                if (!cancelled) setMembers(list);
            } catch (e) {
                if (!cancelled) setMembers([]);
                console.error("getChatMembers failed", e);
            }
        })();
        return () => { cancelled = true; };
    }, [active]);

    // восстановить авторизацию
    useEffect(() => {
        const acc = loadAuthFromStorage();
        if (acc) {
            setToken(acc.token);
            setAuth(acc);
        }
    }, []);

    // стартуем hub и тянем чаты
    useEffect(() => {
        if (!auth) return;
        setToken(auth.token);
        (async () => {
            await hub.start();
            const list = await api.myChats();
            setChats(list);
        })();
    }, [auth, hub]);

    // освежаем имя/аватар текущего пользователя
    useEffect(() => {
        (async () => {
            if (!auth) return;
            try {
                const me = await api.me();
                setAuth((a) => a ? { ...a, name: me.name, avatarUrl: me.avatarUrl ?? a.avatarUrl } : a);
            } catch { /* no-op */ }
        })();
    }, [auth?.userId]);

    // входящие сообщения
    useEffect(() => {
        const handler = (m: Msg) => {
            if (m.chatId === active) setMsgs((prev) => [...prev, m]);
            setChats((prev) =>
                prev.map((c) =>
                    c.id === m.chatId
                        ? {
                            ...c,
                            lastText: m.text || (m.attachments?.length ? "Вложение" : ""),
                            lastUtc: m.sentUtc,
                            lastSenderId: m.senderId,
                        }
                        : c
                )
            );
        };
        hub.onMessage(handler);
        return () => hub.offMessage(handler);
    }, [active, hub]);

    // индикатор «печатает…»
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

    // правки/удаления с хаба
    useEffect(() => {
        const onEdited = (p: { id: number; chatId: number; text: string; editedUtc: string }) => {
            setMsgs((prev) => prev.map((m) => (m.id === p.id ? { ...m, text: p.text, editedUtc: p.editedUtc } : m)));
            setChats((prev) =>
                prev.map((c) => (c.id === p.chatId ? { ...c, lastText: p.text, lastUtc: p.editedUtc } : c))
            );
        };
        const onDeleted = (p: { id: number; chatId: number }) => {
            const editedUtc = new Date().toISOString();
            setMsgs((prev) => prev.map((m) => (m.id === p.id ? { ...m, isDeleted: true, text: "", editedUtc } : m)));
            setChats((prev) =>
                prev.map((c) => (c.id === p.chatId ? { ...c, lastText: "Сообщение удалено", lastUtc: editedUtc } : c))
            );
        };

        hub.onEdited(onEdited);
        hub.onDeleted(onDeleted);
        return () => { hub.offEdited(onEdited); hub.offDeleted(onDeleted); };
    }, [hub]);

    // реакции с хаба
    useEffect(() => {
        function applyReaction(messageId: number, userId: number, emoji: string, add: boolean) {
            setMsgs((prev) =>
                prev.map((m) => {
                    if (m.id !== messageId) return m;
                    const me = auth?.userId === userId;
                    const list = [...(m.reactions ?? [])];
                    const i = list.findIndex((r) => r.emoji === emoji);
                    if (add) {
                        if (i >= 0) list[i] = { ...list[i], count: list[i].count + 1, mine: list[i].mine || me };
                        else list.push({ emoji, count: 1, mine: me });
                    } else if (i >= 0) {
                        const nextCount = Math.max(0, list[i].count - 1);
                        const mine = me ? false : list[i].mine;
                        if (nextCount === 0) list.splice(i, 1);
                        else list[i] = { ...list[i], count: nextCount, mine };
                    }
                    return { ...m, reactions: list };
                })
            );
        }

        const add = (p: { messageId: number; userId: number; emoji: string }) =>
            applyReaction(p.messageId, p.userId, p.emoji, true);
        const rem = (p: { messageId: number; userId: number; emoji: string }) =>
            applyReaction(p.messageId, p.userId, p.emoji, false);

        hub.onReactionAdded(add);
        hub.onReactionRemoved(rem);
        return () => { hub.offReactionAdded(add); hub.offReactionRemoved(rem); };
    }, [hub, auth?.userId]);

    // ЕДИНАЯ подписка на обновление «прочитано до»
    useEffect(() => {
        const onSeen = (p: { chatId: number; userId: number; lastSeenMessageId: number }) => {
            if (p.chatId !== active) return;
            setMembers(prev => prev.map(m =>
                m.id === p.userId ? { ...m, lastSeenMessageId: p.lastSeenMessageId } : m
            ));
        };
        hub.onSeenUpdated(onSeen);
        return () => hub.offSeenUpdated(onSeen);
    }, [hub, active]);

    // ---------- ACTIONS ----------
    async function openChat(id: number) {
        setActive(id);
        await hub.joinChat(id);
        const [data, list, mem] = await Promise.all([
            api.messages(id),
            api.myChats(),
            api.getChatMembers(id),
        ]);
        setMsgs(data);
        setChats(list);
        setMembers(mem);
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

    function upload(file: File, onProgress?: (p: number) => void) {
        return uploadWithProgress(file, onProgress);
    }

    const pingTyping = () => { if (active) void hub.typing(active); };

    function doLogout() {
        logoutThisTab(); setToken(null); setAuth(null); location.reload();
    }

    async function editMessage(id: number, text: string) {
        const editedUtc = new Date().toISOString();
        setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, text, editedUtc } : m)));
        setChats((prev) =>
            prev.map((c) => (c.id === active ? { ...c, lastText: text, lastUtc: editedUtc, lastSenderId: auth!.userId } : c))
        );
        await api.editMessage(id, text);
    }

    async function deleteMessage(id: number) {
        const editedUtc = new Date().toISOString();
        setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, isDeleted: true, text: "", editedUtc } : m)));
        setChats((prev) =>
            prev.map((c) => (c.id === active ? { ...c, lastText: "Сообщение удалено", lastUtc: editedUtc } : c))
        );
        await api.deleteMessage(id);
    }

    async function react(id: number, emoji: string) { await api.react(id, emoji); }
    async function unreact(id: number, emoji: string) { await api.unreact(id, emoji); }

    async function dmTo(userId: number) {
        const chat = await api.startChatWith(userId);
        await openChat(chat.id);
    }

    async function leaveActiveChat() {
        if (!active) return;
        try {
            await api.leaveChat(active);
            const list = await api.myChats();
            setChats(list);
            setActive(null);
            setMsgs([]);
            setMembers([]);
        } catch (e) { console.error("leaveChat failed", e); }
    }

    // прокинем вниз
    async function markSeen(upToMessageId: number) {
        if (!active) return;
        try {
            await api.markSeen(active, upToMessageId);
            // локально подсветим «мои» галочки без ожидания события
            setMembers(prev => prev.map(m =>
                m.id === auth!.userId ? { ...m, lastSeenMessageId: upToMessageId } : m
            ));
        } catch {}
    }

    // ---------- AUTH SCREENS ----------
    if (!auth) {
        return authMode === "login" ? (
            <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
                <LoginForm
                    onLogin={(token, userId, name) => {
                        const acc: StoredAccount = { token, userId, name };
                        setToken(token); saveAuthToStorage(acc); setAuth(acc);
                    }}
                    onSwitchToRegister={() => setAuthMode("register")}
                />
            </div>
        ) : (
            <RegisterForm
                onDone={(token, userId, name) => {
                    const acc: StoredAccount = { token, userId, name };
                    setToken(token); saveAuthToStorage(acc); setAuth(acc);
                }}
                onCancel={() => setAuthMode("login")}
            />
        );
    }

    // ---------- MAIN UI ----------
    return (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 32%) 1fr", height: "100vh" }}>
            <div style={{ position: "fixed", top: 10, left: 10, zIndex: 60 }}>
                <AvatarMenu
                    name={auth.name}
                    avatarUrl={auth.avatarUrl ?? undefined}
                    onProfile={() => setShowProfile(true)}
                    onSearch={() => setShowSearch(true)}
                    onNewChat={() => setShowCreateChat(true)}
                    onLogout={doLogout}
                />
            </div>

            {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}

            {showSearch && (
                <SearchUsersModal
                    currentUserId={auth.userId}
                    onClose={() => setShowSearch(false)}
                    onPick={async (chatId) => {
                        setShowSearch(false);
                        await openChat(chatId);
                    }}
                />
            )}

            {showCreateChat && (
                <CreateChatModal
                    currentUserId={auth.userId}
                    onClose={() => setShowCreateChat(false)}
                    onCreated={async (chatId) => {
                        setShowCreateChat(false);
                        await openChat(chatId);
                        const list = await api.myChats();
                        setChats(list);
                    }}
                />
            )}

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
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReact={react}
                onUnreact={unreact}
                isGroup={!!activeChat?.isGroup}
                members={members}
                onDirectMessage={dmTo}
                onLeaveChat={leaveActiveChat}
                onSeen={markSeen}
            />
        </div>
    );
}
