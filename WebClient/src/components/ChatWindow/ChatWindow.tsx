import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";
import { AttachedChip } from "./AttachedChip";

export type Msg = {
    id: number;
    chatId: number;
    text: string;
    senderId: number;
    sentUtc: string;
    attachments?: Array<{ id: number | string; url?: string; contentType?: string }>;
};

type Pending = { id: number; name: string; thumbUrl?: string; progress?: number }; // <—

type Props = {
    title?: string;
    avatarUrl?: string;             // ← добавь
    userId: number;
    messages: Msg[];
    onSend: (text: string, attachments?: number[]) => Promise<void> | void;
    onUpload: (file: File, onProgress?: (p:number)=>void) => Promise<{id:number; url?:string}>;
    onTyping: () => void;
    typingUsers: string[];
    onLoadOlder?: () => Promise<void> | void;
};

export function ChatWindow({
                               title, avatarUrl, userId, messages, onSend, onUpload, onTyping, typingUsers, onLoadOlder,
                           }: Props) {
    const [text, setText] = useState("");
    const [attached, setAttached] = useState<Pending[]>([]); // очередь прикреплений
    const listRef = useRef<HTMLDivElement>(null);
    const prevHeight = useRef<number>(0);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (nearBottom) el.scrollTo({ top: el.scrollHeight });
    }, [messages.length]);

    async function onScroll() {
        const el = listRef.current;
        if (!el || !onLoadOlder) return;
        if (el.scrollTop < 40) {
            prevHeight.current = el.scrollHeight;
            await onLoadOlder();
            const added = (listRef.current?.scrollHeight ?? 0) - prevHeight.current;
            el.scrollTop = el.scrollTop + added;
        }
    }

    function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    }

    // выбор файлов -> загружаем с прогрессом, но пока только прикрепляем
    async function pickFile(file: File) {
        const tmpId = -Date.now();
        const thumb = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setAttached(prev => [...prev, { id: tmpId, name: file.name, progress: 0, thumbUrl: thumb }]);

        try {
            const res = await onUpload(file, (p) => {
                setAttached(prev => prev.map(x => x.id === tmpId ? { ...x, progress: p } : x));
            });
            // заменяем временный id на настоящий
            setAttached(prev => prev.map(x => x.id === tmpId ? { ...x, id: res.id, progress: 100 } : x));
        } catch {
            setAttached(prev => prev.filter(x => x.id !== tmpId));
            alert("Не удалось загрузить файл");
        } finally {
            // чистим blob-url (если был)
            if (thumb) URL.revokeObjectURL(thumb);
        }
    }

    async function doSend() {
        const t = text.trim();
        const ids = attached.map(a => a.id).filter(id => id > 0) as number[];
        if (!t && ids.length === 0) return;
        await onSend(t, ids);
        setText("");
        setAttached([]);
    }

    return (
        <main className={styles.root}>
            <header className={styles.header}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {avatarUrl && (
                        <img src={avatarUrl}
                             alt=""
                             style={{width:32,height:32,borderRadius:"50%",objectFit:"cover"}} />
                    )}
                    <span>{title ?? "Выберите чат"}</span>
                </div>
                {!!typingUsers.length && <span className={styles.typing}>{typingUsers.join(", ")} печатает…</span>}
            </header>


            <div ref={listRef} className={styles.list} onScroll={onScroll}>
                {messages.map((m) => (
                    <div key={m.id} className={`${styles.bubble} ${m.senderId === userId ? styles.mine : styles.their}`}>
                        {m.text && <div>{m.text}</div>}
                        {m.attachments?.length ? (
                            <div className={styles.attachments}>
                                {m.attachments.map((a) => <Attachment key={String(a.id)} a={a} />)}
                            </div>
                        ) : null}
                        <div className={styles.time}>{dayjs(m.sentUtc).format("HH:mm")}</div>
                    </div>
                ))}
            </div>

            {!!title && (
                <div className={styles.composer}>
                    <label className={styles.attach}>
                        📎
                        <input
                            type="file"
                            multiple
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                files.forEach(pickFile);
                                e.currentTarget.value = ""; // позволит выбрать те же файлы повторно
                            }}
                            hidden
                        />
                    </label>

                    {attached.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            {attached.map(a => (
                                <AttachedChip
                                    key={a.id}
                                    name={a.name}
                                    progress={a.progress}
                                    thumbUrl={a.thumbUrl}
                                    onRemove={() => setAttached(prev => prev.filter(x => x.id !== a.id))}
                                />
                            ))}
                        </div>
                    )}

                    <input
                        className={styles.input}
                        placeholder="Сообщение..."
                        value={text}
                        onChange={(e) => { setText(e.target.value); onTyping(); }}
                        onKeyDown={keyDown}
                    />
                    <button className={styles.send} onClick={doSend}>Отправить</button>
                </div>
            )}
        </main>
    );
}
