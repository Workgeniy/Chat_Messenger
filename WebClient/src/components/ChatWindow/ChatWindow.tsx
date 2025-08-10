import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";

export type Msg = {
    id: number;
    chatId: number;
    text: string;
    senderId: number;
    sentUtc: string;
    attachments?: Array<{ id: string; url?: string; contentType?: string }>;
};

type Props = {
    title?: string;
    userId: number;
    messages: Msg[];
    onSend: (text: string) => void;
    onUpload: (file: File) => void;
    onTyping: () => void;
    typingUsers: string[];
    onLoadOlder?: () => Promise<void> | void;
};

export function ChatWindow({
                               title,
                               userId,
                               messages,
                               onSend,
                               onUpload,
                               onTyping,
                               typingUsers,
                               onLoadOlder,
                           }: Props) {
    const [text, setText] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const prevHeight = useRef<number>(0);

    // автоскролл вниз при новых сообщениях (только когда мы и так близко к низу)
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (nearBottom) {
            el.scrollTo({ top: el.scrollHeight });
        }
    }, [messages.length]);

    // подгрузка истории при скролле вверх
    async function onScroll() {
        const el = listRef.current;
        if (!el || !onLoadOlder) return;
        if (el.scrollTop < 40) {
            // запоминаем высоту ДО догрузки
            prevHeight.current = el.scrollHeight;
            await onLoadOlder();
            // компенсируем прыжок скролла
            const added = (listRef.current?.scrollHeight ?? 0) - prevHeight.current;
            el.scrollTop = el.scrollTop + added;
        }
    }

    function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const t = text.trim();
            if (t) {
                onSend(t);
                setText("");
            }
        }
    }

    return (
        <main className={styles.root}>
            <header className={styles.header}>
                <span>{title ?? "Выберите чат"}</span>
                {!!typingUsers.length && (
                    <span className={styles.typing}>
            {typingUsers.join(", ")} печатает…
          </span>
                )}
            </header>

            <div ref={listRef} className={styles.list} onScroll={onScroll}>
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`${styles.bubble} ${
                            m.senderId === userId ? styles.mine : styles.their
                        }`}
                    >
                        {m.text && <div>{m.text}</div>}

                        {m.attachments?.length ? (
                            <div className={styles.attachments}>
                                {m.attachments.map((a) => (
                                    <Attachment key={a.id} a={a} />
                                ))}
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
                            onChange={(e) =>
                                e.target.files?.[0] && onUpload(e.target.files[0])
                            }
                            hidden
                        />
                    </label>
                    <input
                        className={styles.input}
                        placeholder="Сообщение..."
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            onTyping();
                        }}
                        onKeyDown={keyDown}
                    />
                    <button
                        className={styles.send}
                        onClick={() => {
                            const t = text.trim();
                            if (t) {
                                onSend(t);
                                setText("");
                            }
                        }}
                    >
                        Отправить
                    </button>
                </div>
            )}
        </main>
    );
}
