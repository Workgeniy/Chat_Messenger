import { useEffect, useMemo, useRef, useState } from "react";
import { LoginForm } from "./components/LoginForm/LoginForm";
import { ChatList } from "./components/ChatList/ChatList";
import { ChatWindow} from "./components/ChatWindow/ChatWindow";
import type { Msg } from "./components/ChatWindow/ChatWindow";
import { api, setToken } from "./lib/api";
import { createHub } from "./lib/hub";

// Тип под ответ /api/chats
type Chat = { id: number; title: string; unread: number };

export default function App() {
    const [auth, setAuth] = useState<{ token: string; userId: number; name: string } | null>(null);
    const [chats, setChats] = useState<Chat[]>([]);
    const [active, setActive] = useState<number | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [typing, setTyping] = useState<string[]>([]);
    const typingTimersRef = useRef<Map<string, any>>(new Map());

    // восстановление токена после перезагрузки
    useEffect(() => {
        const t = localStorage.getItem("token");
        const uid = localStorage.getItem("userId");
        const name = localStorage.getItem("name");
        if (t && uid && name) {
            setToken(t);
            setAuth({ token: t, userId: Number(uid), name });
        }
    }, []);

    // создаём соединение с хабом; токен берём из состояния или localStorage
    const hub = useMemo(
        () => createHub(() => auth?.token ?? localStorage.getItem("token")),
        [auth]
    );

    // после логина: стартуем хаб и тянем список чатов
    useEffect(() => {
        if (!auth) return;
        setToken(auth.token);
        (async () => {
            await hub.start();
            const list = await api.myChats();
            setChats(list);
        })();
    }, [auth]);

    // получаем входящие сообщения через SignalR
    useEffect(() => {
        const handler = (m: any) => {
            // ожидается: { id, chatId, text, senderId, sentUtc }
            if (m.chatId === active) setMsgs((prev) => [...prev, m]);
        };
        hub.onMessage(handler);
        return () => hub.offMessage(handler);
    }, [active, hub]);

    // индикатор "печатает…"
    useEffect(() => {
        const timers = typingTimersRef.current;
        const handler = (p: { chatId: number; userId: number; displayName?: string }) => {
            if (p.chatId !== active) return;
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
    }, [active, hub]);

    // открыть чат: подписка в группу + загрузка истории
    async function openChat(id: number) {
        setActive(id);
        await hub.joinChat(id);
        const data = await api.messages(id);
        setMsgs(data);
        setCursor(data.length ? data[0].sentUtc : undefined); // курсор — самое старое сообщение в выдаче
    }

    // подгрузка истории (кручёная вверх)
    async function loadOlder() {
        if (!active || !cursor) return;
        const older = await api.messages(active, cursor);
        if (!older.length) return;
        setMsgs((prev) => [...older, ...prev]);
        setCursor(older[0].sentUtc);
    }

    // отправка текста
    async function send(text: string) {
        if (!active) return;
        await api.sendMessage(active, text);
        // новое сообщение придёт через SignalR -> onMessage
    }

    // загрузка файла и отправка как вложение
    async function upload(file: File) {
        if (!active) return;
        const { id } = await api.upload(file);
        await api.sendMessage(active, "", [id]);
    }

    // "печатает"
    const pingTyping = () => {
        if (active) hub.typing(active);
    };

    // экран логина
    if (!auth) {
        return (
            <LoginForm
                onLogin={(token, userId, name) => {
                    setToken(token);
                    localStorage.setItem("token", token);
                    localStorage.setItem("userId", String(userId));
                    localStorage.setItem("name", name);
                    setAuth({ token, userId, name });
                }}
            />
        );
    }

    // основной UI
    return (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "100vh" }}>
            <ChatList items={chats} activeId={active} onOpen={openChat} />
            <ChatWindow
                title={chats.find((c) => c.id === active)?.title}
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
