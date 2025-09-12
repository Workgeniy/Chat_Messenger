import { useEffect, useMemo, useRef, useState } from "react";
import { LoginForm } from "./components/LoginForm/LoginForm";
import { RegisterForm } from "./components/LoginForm/RegisterForm";
import { ChatList } from "./components/ChatList/ChatList";
import ChatWindow from "./components/ChatWindow/ChatWindow";
import ProfilePanel from "./components/Profile/ProfilePanel";
import AvatarMenu from "./components/Users/AvatarMenu";
import SearchUsersModal from "./components/Users/SearchUsersModal";
import CreateChatModal from "./components/Chats/CreateChatModal";

import {
    api,
    setToken,
    postLoginInit,
    editMessageE2EE,
    maybeDecryptMessage,
    uploadEncryptedWithProgress,
    type Chat,
    type Msg,
    type Participant,
    authFetch
} from "./lib/api";

import { createHub } from "./lib/hub";
import {
    saveAuthToStorage,
    loadAuthFromStorage,
    logoutThisTab,
    type StoredAccount,
} from "./lib/authStore";
import {
    forceRefreshRecipientKeys,
    initActiveUserFromLocalStorage,
    reinstallMyKeys,
    setActiveE2EEUser
} from "./lib/crypto";

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

    const [presence, setPresence] = useState<Map<number, { isOnline: boolean; lastSeenUtc?: string | null }>>(new Map());
    const [, setTypingChatIds] = useState<Set<number>>(new Set());

    const [keyAlert, setKeyAlert] = useState<{ userId: number, oldFp: string, newFp: string } | null>(null);

    const [typingByChat, setTypingByChat] = useState<Map<number, Set<number>>>(new Map());
    const [showAddMembers, setShowAddMembers] = useState(false);

    const [isNarrow, setIsNarrow] = useState(
        typeof window !== "undefined" && window.matchMedia("(max-width: 920px)").matches
    );

    const [, setTyping] = useState<string[]>([]);
    const typingTimersRef = useRef<Map<string, any>>(new Map());

    const activeChat = chats.find((c) => c.id === active) ?? null;

    // hub с ленивым токеном
    const hub = useMemo(() => createHub(() => auth?.token ?? null), [auth]);

    const isEncrypted = (s?: string) =>
        !!s && (s.startsWith("E2EE1:") || s.startsWith("E2EED1:") || s.startsWith("E2EEG1:"));


    useEffect(() => {
        document.title = "СhatFlow";
    }, []);

    useEffect(() => {
        initActiveUserFromLocalStorage();
        // если есть токен – подтянем me и догоним ключи
        (async () => {
            try {
                const me = await api.me();
                await postLoginInit(me.id);
            } catch {}
        })();
    }, []);

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
        const mq = window.matchMedia("(max-width: 920px)");
        const handler = () => setIsNarrow(mq.matches);
        mq.addEventListener?.("change", handler);
        return () => mq.removeEventListener?.("change", handler);
    }, []);

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
                return [item, ...prev];
            });
        };

        hub.connection.on("ChatCreated", onChatCreated);
        return () => hub.connection.off("ChatCreated", onChatCreated);
    }, [hub]);

    useEffect(() => {
        const onKeyChange = (e: Event) => {
            const d = (e as CustomEvent).detail as { userId: number; oldFp: string; newFp: string };
            setKeyAlert(d);
        };
        window.addEventListener("e2ee:keychange", onKeyChange as any);
        return () => window.removeEventListener("e2ee:keychange", onKeyChange as any);
    }, []);

    // восстановить авторизацию
    useEffect(() => {
        const acc = loadAuthFromStorage();
        if (acc) {
            setToken(acc.token);
            setAuth(acc);
            localStorage.setItem("userId", String(acc.userId));
            setActiveE2EEUser(acc.userId);
            void postLoginInit(acc.userId);
        }
    }, []);

    // стартуем hub и тянем чаты
    useEffect(() => {
        if (!auth) return;
        setToken(auth.token);
        (async () => {
            await postLoginInit(auth.userId);
            await hub.start();
            const list = await api.myChats();
            setChats(await decryptPreviews(list));
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
        };

        hub.connection.on("PresenceChanged", handler);
        return () => hub.connection.off("PresenceChanged", handler);
    }, [hub, setChats]);

    useEffect(() => {
        if (!auth) return;
        const onPresence = (p: { userId: number; isOnline: boolean; lastSeenUtc?: string | null }) => {
            setPresence(prev => {
                const next = new Map(prev);
                next.set(p.userId, { isOnline: p.isOnline, lastSeenUtc: p.lastSeenUtc ?? null });
                return next;
            });
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
        const onSnapshot = (arr: Array<{ userId: number; isOnline: boolean; lastSeenUtc?: string | null }>) => {
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
        const h = (p: { chatId: number; userId: number }) => {
            if (p.userId === auth.userId) return;
            setTypingByChat(prev => {
                const next = new Map(prev);
                const set = new Set(next.get(p.chatId) ?? []);
                set.add(p.userId);
                next.set(p.chatId, set);
                return next;
            });
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

    // входящие сообщения (расшифровка + превью)
    useEffect(() => {
        const handler = async (m: Msg) => {
            const prepared: Msg = (isEncrypted(m.text))
                ? { ...m, text: (await maybeDecryptMessage(m.senderId, m.text)) ?? m.text }
                : m;

            if (m.chatId === active) {
                setMsgs(prev => (prev.some(x => x.id === prepared.id) ? prev : [...prev, prepared]));
            }
            const preview = prepared.text || (m.attachments?.length ? "Вложение" : "");

            setChats(prev => {
                const exists = prev.some(c => c.id === m.chatId);
                if (!exists) {
                    (async () => {
                        try {
                            const list = await api.myChats();
                            setChats(await decryptPreviews(list));
                        } catch (e) { console.error("myChats reload failed", e); }
                    })();
                    return prev;
                }
                return prev.map(c => {
                    if (c.id !== m.chatId) return c;
                    const incUnread = m.chatId !== active && m.senderId !== auth?.userId
                        ? (c.unreadCount ?? 0) + 1
                        : (c.unreadCount ?? 0);
                    return {
                        ...c,
                        lastText: preview,
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
        const onChatUpdated = (p: { id: number; avatarUrl?: string | null; title?: string | null }) => {
            setChats(prev => prev.map(c =>
                c.id === p.id ? { ...c, ...(p.avatarUrl !== undefined ? { avatarUrl: p.avatarUrl ?? undefined } : {}), ...(p.title ? { title: p.title } : {}) } : c
            ));
        };
        hub.connection.on("ChatUpdated", onChatUpdated);
        return () => hub.connection.off("ChatUpdated", onChatUpdated);
    }, [hub]);


    useEffect(() => {
        const onCreated = (c: { id: number; title: string; avatarUrl?: string; isGroup: boolean }) => {
            setChats(prev => (prev.some(x => x.id === c.id)
                ? prev
                : [{ id: c.id, title: c.title, avatarUrl: c.avatarUrl, isGroup: c.isGroup, unreadCount: 0 }, ...prev]));
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
            setTypingChatIds(prev => {
                if (prev.has(p.chatId)) return prev;
                const next = new Set(prev);
                next.add(p.chatId);
                return next;
            });

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

    // правки/удаления (с расшифровкой)
    useEffect(() => {
        const onEdited = async (p: { id: number; chatId: number; text: string; editedUtc: string }) => {
            const senderId = (msgs.find(x => x.id === p.id)?.senderId) ?? auth!.userId;
            const plain = isEncrypted(p.text)
                ? (await maybeDecryptMessage(senderId, p.text)) ?? p.text
                : p.text;

            setMsgs(prev => prev.map(m => (m.id === p.id ? { ...m, text: plain, editedUtc: p.editedUtc } : m)));
            setChats(prev => prev.map(c => (c.id === p.chatId ? { ...c, lastText: plain, lastUtc: p.editedUtc } : c)));
        };

        const onDeleted = (p: { id: number; chatId: number }) => {
            const editedUtc = new Date().toISOString();
            setMsgs(prev => prev.map(m => (m.id === p.id ? { ...m, isDeleted: true, text: "", editedUtc } : m)));
            setChats(prev => prev.map(c => (c.id === p.chatId ? { ...c, lastText: "Сообщение удалено", lastUtc: editedUtc } : c)));
        };

        hub.onEdited(onEdited);
        hub.onDeleted(onDeleted);
        return () => { hub.offEdited(onEdited); hub.offDeleted(onDeleted); };
    }, [hub, msgs, auth?.userId]);

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

        const decrypted = await Promise.all(
            data.map(async m => {
                if (isEncrypted(m.text)) {
                    const pt = await maybeDecryptMessage(m.senderId, m.text);
                    return { ...m, text: pt ?? m.text };
                }
                return m;
            })
        );

        setMsgs(decrypted);
        setChats(await decryptPreviews(list));
        setMembers(mem);
        setCursor(data.length ? data[0].sentUtc : undefined);
    }

    async function loadOlder() {
        if (!active || !cursor) return;
        const older = await api.messages(active, cursor);
        if (!older.length) return;

        const decrypted = await Promise.all(
            older.map(async m => {
                if (isEncrypted(m.text)) {
                    const pt = await maybeDecryptMessage(m.senderId, m.text);
                    return { ...m, text: pt ?? m.text };
                }
                return m;
            })
        );

        setMsgs((prev) => [...decrypted, ...prev]);
        setCursor(older[0].sentUtc);
    }

    async function send(text: string, attachments?: number[]) {
        if (!active) return;
        const oppId = !activeChat?.isGroup ? activeChat?.opponentId : undefined;
        await api.sendMessage(
            active,
            text,
            attachments && attachments.length ? attachments : undefined,
            oppId
        );
    }

    function isDual(s?: string) { return !!s && s.startsWith("E2EED1:"); }
    function isV1(s?: string) { return !!s && s.startsWith("E2EE1:"); }

    async function decryptPreviews(list: Chat[]): Promise<Chat[]> {
        return Promise.all(list.map(async c => {
            if (!c.isGroup && c.lastText && (isV1(c.lastText) || isDual(c.lastText))) {
                const senderId = c.lastSenderId ?? auth!.userId;
                try {
                    const pt = await maybeDecryptMessage(senderId, c.lastText);
                    return { ...c, lastText: pt ?? c.lastText };
                } catch { /* ignore */ }
            }
            return c;
        }));
    }

    function upload(file: File, onProgress?: (p: number) => void) {
        return uploadEncryptedWithProgress(file, onProgress);
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
        logoutThisTab(); setToken(null); setAuth(null); localStorage.removeItem("userId"); location.reload();
    }

    async function editMessage(id: number, newText: string) {
        const editedUtc = new Date().toISOString();

        setMsgs(prev => prev.map(m => (m.id === id ? { ...m, text: newText, editedUtc } : m)));
        setChats(prev =>
            prev.map(c => (c.id === active ? { ...c, lastText: newText, lastUtc: editedUtc, lastSenderId: auth!.userId } : c))
        );

        if (!activeChat?.isGroup && activeChat?.opponentId) {
            await editMessageE2EE(id, newText, activeChat.opponentId);
        } else {
            await api.editMessage(id, newText);
        }
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
            setMembers(prev => prev.map(m =>
                m.id === auth!.userId ? { ...m, lastSeenMessageId: upToMessageId } : m
            ));
        } catch { }
    }

    // ---------- AUTH SCREENS ----------
    if (!auth) {
        return authMode === "login" ? (
            <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
                <LoginForm
                    onLogin={async (token, userId, name) => {
                        const acc: StoredAccount = { token, userId, name };
                        setToken(token);
                        saveAuthToStorage(acc);
                        localStorage.setItem("token", token);
                        setAuth(acc);
                        localStorage.setItem("userId", String(userId));
                        setActiveE2EEUser(userId);
                        await postLoginInit(userId);
                    }}
                    onSwitchToRegister={() => setAuthMode("register")}
                />
            </div>
        ) : (
            <RegisterForm
                onDone={async (token, userId, name) => {
                    const acc: StoredAccount = { token, userId, name };
                    setToken(token);
                    saveAuthToStorage(acc);
                    localStorage.setItem("token", token);
                    setAuth(acc);
                    localStorage.setItem("userId", String(userId));
                    setActiveE2EEUser(userId);
                    await postLoginInit(userId);
                }}
                onCancel={() => setAuthMode("login")}
            />
        );
    }

    // ---------- MAIN UI ----------
    return (
        <div className="app-shell" style={{ display: "grid", gridTemplateColumns:isNarrow ? "1fr" :
                "minmax(320px, 32%) 1fr", height: "100vh", width: "100%", maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ position: "fixed", top: 10, left: 10, zIndex: 60,
                display: isNarrow && active ? "none" : "block" }}>
                <AvatarMenu
                    name={auth.name}
                    avatarUrl={auth.avatarUrl ?? undefined}
                    onProfile={() => setShowProfile(true)}
                    onSearch={() => setShowSearch(true)}
                    onNewChat={() => setShowCreateChat(true)}
                    onLogout={doLogout}
                    onResetE2EE={async () => {
                        await reinstallMyKeys(authFetch, auth.userId);
                        alert("Ключи пересозданы и загружены. Отправьте новое сообщение для проверки.");
                    }}
                />
            </div>

            {keyAlert && (
                <div style={{
                    position: "fixed", bottom: 12, left: 12, right: 12, zIndex: 1000,
                    background: "#fff3cd", color: "#664d03", border: "1px solid #ffe69c",
                    borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center"
                }}>
                    <span>Код безопасности контакта изменился. Проверьте по другому каналу.</span>
                    <button style={{ marginLeft: "auto" }} onClick={() => setKeyAlert(null)}>Ок</button>
                </div>
            )}

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

            {showAddMembers && active && (
                <SearchUsersModal
                    currentUserId={auth.userId}
                    excludeUserIds={members.map(m => m.id)}
                    multiSelect
                    onClose={() => setShowAddMembers(false)}
                    // новый колбэк (добавь его в модалку), если есть мультивыбор
                    onPickUsers={async (ids: number[]) => {
                        if (!ids.length) return;
                        try {
                            await api.addChatMembers(active, ids);
                            setShowAddMembers(false);
                            setMembers(await api.getChatMembers(active)); // обновим список участников
                        } catch (e) {
                            console.error(e);
                            alert("Не удалось добавить участников");
                        }
                    }}
                    // fallback — если у модалки пока только onPick одного пользователя
                    onPick={async (userId: number) => {
                        try {
                            await api.addChatMembers(active, [userId]);
                            setShowAddMembers(false);
                            setMembers(await api.getChatMembers(active));
                        } catch (e) {
                            console.error(e);
                            alert("Не удалось добавить участника");
                        }
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

            {/* Список чатов */}
            <div
                style={{
                    display: isNarrow && active ? "none" : "block",
                    height: "100%"
                }}
            >
                <ChatList
                    items={chats}
                    activeId={active}
                    onOpen={openChat}
                    myId={auth.userId}
                    typingByChat={typingByChat}
                    presence={presence}
                />
            </div>

            {/* Окно чата */}
            <div
                style={{
                    display: isNarrow && !active ? "none" : "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    height: "100svh",
                    width: "100%",
                    maxWidth: "100%",
                    overflow: "hidden"
                }}
            >
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
                    onAddMembers={() => setShowAddMembers(true)}
                    onRefreshPeerKey={async () => {
                        if (!activeChat || activeChat.isGroup || !activeChat.opponentId) return;
                        await forceRefreshRecipientKeys(activeChat.opponentId, authFetch);
                        alert("Ключ контакта перечитан. Отправьте новое сообщение и проверьте расшифровку.");
                    }}
                    onRemoveMember={async (userId: number) => {
                        if (!active) return;
                        await api.removeChatMember(active, userId);
                        // обновим список участников после удаления
                        setMembers(await api.getChatMembers(active));
                    }}
                    onChangeChatAvatar={async (file) => {
                        if (!active) return;

                        const API_BASE = (import.meta as any)?.env?.VITE_API_BASE ?? "/api";
                        const form = new FormData();
                        form.append("file", file);     // наиболее частый кейс
                        form.append("avatar", file);   // на случай, если бэкенд ждёт "avatar"

                        let res: Response;
                        try {
                            res = await authFetch(`${API_BASE}/chats/${active}/avatar`, {
                                method: "POST",            // если у тебя на бэке PUT — тут поменяй
                                body: form,
                            });
                        } catch (e) {
                            console.error(e);
                            alert("Не удалось связаться с сервером" +
                                "");
                            return;
                        }

                        if (!res.ok) {
                            const txt = await res.text().catch(() => "");
                            alert(txt || `Не удалось обновить аватар (HTTP ${res.status})`);
                            return;
                        }


                        const { avatarUrl } = await res.json();
                        setChats(cs => cs.map(c => c.id === active ? ({ ...c, avatarUrl }) : c));
                    }}


                    onBack={isNarrow ? () => setActive(null) : undefined}
                />
            </div>
        </div>

    );
}
