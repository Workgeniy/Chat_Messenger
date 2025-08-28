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

    const [presence, setPresence] = useState<Map<number, {isOnline: boolean; lastSeenUtc?: string | null}>>(new Map());
    const [, setTypingChatIds] = useState<Set<number>>(new Set());

    const [typingByChat, setTypingByChat] = useState<Map<number, Set<number>>>(new Map());

    const [, setTyping] = useState<string[]>([]);
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

    useEffect(() => {
        const onChatCreated = (p: {
            id: number;
            title: string;
            avatarUrl?: string | null;
            isGroup: boolean;
            opponentId?: number | null;
            isOnline?: boolean | null;
            lastSeenUtc?: string | null;
            lastText?: string | null;
            lastUtc?: string | null;
            lastSenderId?: number | null;
            unreadCount?: number | null;
        }) => {
            setChats(prev => {
                // если уже есть — не дублируем
                if (prev.some(c => c.id === p.id)) return prev;
                const item: Chat = {
                    id: p.id,
                    title: p.title,
                    avatarUrl: p.avatarUrl ?? undefined,
                    isGroup: p.isGroup,
                    opponentId: p.opponentId ?? undefined,
                    isOnline: !!p.isOnline,
                    lastSeenUtc: p.lastSeenUtc ?? undefined,
                    lastText: p.lastText ?? null,
                    lastUtc: p.lastUtc ?? null,
                    lastSenderId: p.lastSenderId ?? undefined,
                    unreadCount: p.unreadCount ?? 0
                } as Chat;
                return [item, ...prev]; // вставим наверх
            });
        };

        hub.connection.on("ChatCreated", onChatCreated);
        return () => hub.connection.off("ChatCreated", onChatCreated);
    }, [hub]);


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

    useEffect(() => {
        const handler = (p: { userId: number; isOnline: boolean; lastSeenUtc?: string | null }) => {
            setPresence(prev => {
                const next = new Map(prev);
                next.set(p.userId, { isOnline: p.isOnline, lastSeenUtc: p.lastSeenUtc ?? null });
                return next;
            });

            // по возможности сразу подсветим в списке (для 1:1 чатов с opponentId)
            // setChats(prev => prev.map(c => {
            //     if (c.isGroup) return c;
            //     // если сервер прислал opponentId — обновим онлайн в карточке
            //     if (c.opponentId && c.opponentId === p.userId) {
            //         return { ...c, isOnline: p.isOnline, lastSeenUtc: p.lastSeenUtc ?? c.lastSeenUtc };
            //     }
            //     return c;
            // }));
        };

        hub.connection.on("PresenceChanged", handler);
        return () => hub.connection.off("PresenceChanged", handler);
    }, [hub, setChats]);

    useEffect(() => {
        if (!auth) return;
        const onPresence = (p: { userId:number; isOnline:boolean; lastSeenUtc?:string|null }) => {
            setPresence(prev => {
                const next = new Map(prev);
                next.set(p.userId, { isOnline: p.isOnline, lastSeenUtc: p.lastSeenUtc ?? null });
                return next;
            });
            // если это 1:1 чат и у чата есть opponentId — сразу отразим в карточке
            setChats(prev => prev.map(c => {
                if (c.isGroup) return c;
                return (c.opponentId && c.opponentId === p.userId)
                    ? { ...c, isOnline: p.isOnline, lastSeenUtc: p.lastSeenUtc ?? c.lastSeenUtc }
                    : c;
            }));
        };
        hub.onPresenceChanged(onPresence);
        return () => hub.offPresenceChanged(onPresence);
    }, [hub, auth]);

    useEffect(() => {
        if (!auth) return;
        const onSnapshot = (arr: Array<{userId:number; isOnline:boolean; lastSeenUtc?: string | null}>) => {
            setPresence(prev => {
                const next = new Map(prev);
                for (const p of arr) next.set(p.userId, { isOnline: !!p.isOnline, lastSeenUtc: p.lastSeenUtc ?? null });
                return next;
            });
        };

        hub.connection.on("PresenceSnapshot", onSnapshot);
        return () => hub.connection.off("PresenceSnapshot", onSnapshot);
    }, [hub, auth]);


// typing events (для списка)
    useEffect(() => {
        if (!auth) return;
        const h = (p:{chatId:number; userId:number}) => {
            if (p.userId === auth.userId) return; // не показываем свой тайпинг в списке
            setTypingByChat(prev => {
                const next = new Map(prev);
                const set = new Set(next.get(p.chatId) ?? []);
                set.add(p.userId);
                next.set(p.chatId, set);
                return next;
            });
            // авто-очистка через 3s
            setTimeout(() => {
                setTypingByChat(prev => {
                    const next = new Map(prev);
                    const set = new Set(next.get(p.chatId) ?? []);
                    set.delete(p.userId);
                    if (set.size === 0) next.delete(p.chatId);
                    else next.set(p.chatId, set);
                    return next;
                });
            }, 3000);
        };
        hub.onTyping(h);
        return () => hub.offTyping(h);
    }, [hub, auth]);


    // входящие сообщения
    useEffect(() => {
        const handler = (m: Msg) => {
            // если это активный чат — добавляем в ленту
            if (m.chatId === active) {
                setMsgs(prev => [...prev, m]);
            }

            setChats(prev => {
                const exists = prev.some(c => c.id === m.chatId);
                if (!exists) {
                    // ✅ чата в списке нет — подтянем превью с сервера
                    (async () => {
                        try {
                            const list = await api.myChats();
                            setChats(list);
                        } catch (e) {
                            console.error("myChats reload failed", e);
                        }
                    })();
                    return prev; // пока оставим как есть; после загрузки setChats(list) обновит состояние
                }

                // обновим last* и непрочитанные
                return prev.map(c => {
                    if (c.id !== m.chatId) return c;
                    const incUnread =
                        // увеличиваем, если сообщение не в активном чате и отправитель не я
                        m.chatId !== active && m.senderId !== auth?.userId ? (c.unreadCount ?? 0) + 1 : (c.unreadCount ?? 0);

                    return {
                        ...c,
                        lastText: m.text || (m.attachments?.length ? "Вложение" : ""),
                        lastUtc: m.sentUtc,
                        lastSenderId: m.senderId,
                        unreadCount: incUnread,
                    };
                });
            });
        };

        hub.onMessage(handler);
        return () => hub.offMessage(handler);
    }, [active, hub, auth?.userId]);

    useEffect(() => {
        const onCreated = (c: { id:number; title:string; avatarUrl?:string; isGroup:boolean }) => {
            setChats(prev => (prev.some(x => x.id === c.id)
                ? prev
                : [{ id:c.id, title:c.title, avatarUrl:c.avatarUrl, isGroup:c.isGroup, unreadCount:0 }, ...prev]));
        };
        hub.connection.on("ChatCreated", onCreated);
        return () => hub.connection.off("ChatCreated", onCreated);
    }, [hub]);


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

    useEffect(() => {
        const timers = new Map<number, ReturnType<typeof setTimeout>>();

        const handler = (p: { chatId: number }) => {
            // 1) добавить chatId в сет
            setTypingChatIds(prev => {
                if (prev.has(p.chatId)) return prev;
                const next = new Set(prev);
                next.add(p.chatId);
                return next;
            });

            // 2) сбросить таймер (3 сек «затухание»)
            const prevTimer = timers.get(p.chatId);
            if (prevTimer) clearTimeout(prevTimer);
            const t = setTimeout(() => {
                setTypingChatIds(prev => {
                    if (!prev.has(p.chatId)) return prev;
                    const next = new Set(prev);
                    next.delete(p.chatId);
                    return next;
                });
                timers.delete(p.chatId);
            }, 3000);
            timers.set(p.chatId, t);
        };

        hub.onTyping(handler);
        return () => {
            hub.offTyping(handler);
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, [hub]);


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

    const typingNamesForHeader = useMemo(() => {
        if (!active || members.length !== 2) return [];
        const set = typingByChat.get(active);
        if (!set) return [];
        const ids = [...set].filter(id => id !== auth!.userId);
        if (!ids.length) return [];
        const idToName = new Map(members.map(m => [m.id, m.name]));
        return ids.map(id => idToName.get(id) ?? `User#${id}`);
    }, [typingByChat, active, members, auth?.userId]);

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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 32%) 1fr", height: "100vh", width: "100%" }}>
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

            <ChatList
                items={chats}
                activeId={active}
                onOpen={openChat}
                myId={auth.userId}
                typingByChat={typingByChat}
                presence={presence}
            />
            <div style={{ display:'flex', flexDirection:'column', minHeight:0, height:'100svh', width:'100%' }}>

                <ChatWindow
                    title={activeChat?.title}
                    avatarUrl={activeChat?.avatarUrl}
                    userId={auth.userId}
                    messages={msgs}
                    onSend={send}
                    onUpload={upload}
                    onTyping={pingTyping}
                    typingUsers={typingNamesForHeader}
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
        </div>
    );
}
