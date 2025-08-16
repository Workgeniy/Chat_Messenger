import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";
import { AttachedChip } from "./AttachedChip";

export type Reaction = { emoji: string; count: number; mine?: boolean };

export type Msg = {
    id: number;
    chatId: number;
    text: string;
    senderId: number;
    sentUtc: string;
    editedUtc?: string | null;
    isDeleted?: boolean;
    attachments?: Array<{ id: number | string; url?: string; contentType?: string }>;
    reactions?: Reaction[];
};

type Pending = { id: number; name: string; thumbUrl?: string; progress?: number };

type Props = {
    title?: string;
    avatarUrl?: string;
    userId: number;
    messages: Msg[];
    onSend: (text: string, attachments?: number[]) => Promise<void> | void;

    onEdit?: (id: number, text: string) => Promise<void> | void;
    onDelete?: (id: number) => Promise<void> | void;
    onReact?: (id: number, emoji: string) => Promise<void> | void;
    onUnreact?: (id: number, emoji: string) => Promise<void> | void;

    onUpload: (file: File, onProgress?: (p: number) => void) => Promise<{ id: number; url?: string }>;
    onTyping: () => void;
    typingUsers: string[];
    onLoadOlder?: () => Promise<void> | void;
};

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function ChatWindow({
                               title,
                               avatarUrl,
                               userId,
                               messages,
                               onSend,
                               onUpload,
                               onTyping,
                               typingUsers,
                               onLoadOlder,
                               onEdit,
                               onDelete,
                               onReact,
                               onUnreact,
                           }: Props) {
    const [text, setText] = useState("");
    const [attached, setAttached] = useState<Pending[]>([]);
    const listRef = useRef<HTMLDivElement>(null);
    const prevHeight = useRef<number>(0);

    // меню / редактирование
    const [menuFor, setMenuFor] = useState<number | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState("");

    // автоскролл
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (nearBottom) el.scrollTo({ top: el.scrollHeight });
    }, [messages.length]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuFor(null);
        const onDoc = () => setMenuFor(null);
        window.addEventListener("keydown", onKey);
        document.addEventListener("click", onDoc);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("click", onDoc);
        };
    }, []);

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

    async function pickFile(file: File) {
        const tmpId = -Date.now();
        const thumb = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setAttached((prev) => [...prev, { id: tmpId, name: file.name, progress: 0, thumbUrl: thumb }]);
        try {
            const res = await onUpload(file, (p) => {
                setAttached((prev) => prev.map((x) => (x.id === tmpId ? { ...x, progress: p } : x)));
            });
            setAttached((prev) => prev.map((x) => (x.id === tmpId ? { ...x, id: res.id, progress: 100 } : x)));
        } catch {
            setAttached((prev) => prev.filter((x) => x.id !== tmpId));
            alert("Не удалось загрузить файл");
        } finally {
            if (thumb) URL.revokeObjectURL(thumb);
        }
    }

    async function doSend() {
        const t = text.trim();
        const ids = attached.map((a) => a.id).filter((id) => id > 0) as number[];
        if (!t && ids.length === 0) return;
        await onSend(t, ids);
        setText("");
        setAttached([]);
    }

    return (
        <main className={styles.root}>
            <header className={styles.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {avatarUrl && (
                        <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                    )}
                    <span>{title ?? "Выберите чат"}</span>
                </div>
                {!!typingUsers.length && <span className={styles.typing}>{typingUsers.join(", ")} печатает…</span>}
            </header>

            <div ref={listRef} className={styles.list} onScroll={onScroll}>
                {messages.map((m) => {
                    const mine = m.senderId === userId;
                    const isEditing = editingId === m.id;

                    return (
                        <div
                            key={m.id}
                            className={`${styles.bubble} ${mine ? styles.mine : styles.their}`}
                            onClick={(e) => {
                                if (m.isDeleted) return;               // <-- НЕ открываем меню у удалённого
                                setMenuFor(m.id);

                                setMenuPos({ x: e.clientX, y: e.clientY });
                            }}
                        >
                            {/* Кнопка «быстрая реакция» только на СВОИХ и не удалённых */}
                            {mine && !m.isDeleted && (
                                <button
                                    className={styles.quickReact}        // <-- добавь стиль (см. ниже)
                                    title="Реакции"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuFor(m.id);

                                        setMenuPos({ x: e.clientX, y: e.clientY });
                                    }}
                                >
                                    😊
                                </button>
                            )}
                            {/* тело сообщения */}
                            {m.isDeleted ? (
                                <div className={styles.deleted}>Сообщение удалено</div>
                            ) : isEditing ? (
                                <div className={styles.editWrap}>
                                    <input
                                        className={styles.editInput}
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                const nt = editText.trim();
                                                if (nt && nt !== m.text && onEdit) {
                                                    Promise.resolve(onEdit(m.id, nt)).finally(() => {
                                                        setEditingId(null);
                                                        setEditText("");
                                                        setMenuFor(null);
                                                    });
                                                } else {
                                                    setEditingId(null);
                                                    setEditText("");
                                                    setMenuFor(null);
                                                }
                                            }
                                            if (e.key === "Escape") {
                                                setEditingId(null);
                                                setEditText("");
                                                setMenuFor(null);
                                            }
                                        }}
                                        autoFocus
                                        placeholder="Изменить сообщение"
                                    />
                                    <div className={styles.editActions}>
                                        <button
                                            onClick={() => {
                                                const nt = editText.trim();
                                                if (nt && nt !== m.text && onEdit) {
                                                    Promise.resolve(onEdit(m.id, nt)).finally(() => {
                                                        setEditingId(null);
                                                        setEditText("");
                                                        setMenuFor(null);
                                                    });
                                                } else {
                                                    setEditingId(null);
                                                    setEditText("");
                                                    setMenuFor(null);
                                                }
                                            }}
                                        >
                                            Сохранить
                                        </button>
                                        <button onClick={() => { setEditingId(null); setEditText(""); setMenuFor(null); }}>Отмена</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {m.text && <div>{m.text}</div>}
                                    {m.attachments?.length ? (
                                        <div className={styles.attachments}>
                                            {m.attachments.map((a) => (
                                                <Attachment key={String(a.id)} a={a} />
                                            ))}
                                        </div>
                                    ) : null}
                                </>
                            )}

                            {/* Ряд реакций показываем ТОЛЬКО если сообщение не удалено */}
                            {!m.isDeleted && !!m.reactions?.length && (
                                <div className={styles.reactionsRow}>
                                    {m.reactions.map(r => (
                                        <button
                                            key={r.emoji}
                                            className={`${styles.reaction} ${r.mine ? styles.reactionMine : ""}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (m.isDeleted) return;       // <-- подстраховка
                                                if (r.mine && onUnreact) onUnreact(m.id, r.emoji);
                                                else if (onReact) onReact(m.id, r.emoji);
                                            }}
                                            title={r.mine ? "Убрать реакцию" : "Поставить реакцию"}
                                        >
                                            {r.emoji} {r.count > 1 ? r.count : ""}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Время */}
                            <div className={styles.time}>
                                {dayjs(m.sentUtc).format("HH:mm")}
                                {m.editedUtc ? <span className={styles.edited}>&nbsp;(изменено)</span> : null}
                            </div>
                        </div>
                    );
                })}

                {/* Плавающее меню */}
                {menuFor !== null && (
                    <div
                        className={styles.ctxMenu}
                        style={{ left: menuPos.x, top: menuPos.y }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseLeave={() => setMenuFor(null)}
                    >
                        <div className={styles.emojiGrid}>
                            {EMOJIS.map((e) => (
                                <button
                                    key={e}
                                    className={styles.emojiBtn}
                                    onClick={() => {
                                        const id = menuFor!;
                                        setMenuFor(null);
                                        onReact?.(id, e);
                                    }}
                                >
                                    {e}
                                </button>
                            ))}
                        </div>

                        <div className={styles.menuLine} />

                        {(() => {
                            const m = messages.find((x) => x.id === menuFor);
                            if (!m || m.isDeleted) return null;
                            const mine = m.senderId === userId;
                            return (
                                <div className={styles.menuActions}>
                                    {mine && onEdit && (
                                        <button
                                            className={styles.menuBtn}
                                            onClick={() => {
                                                setEditingId(m.id);
                                                setEditText(m.text ?? "");
                                                setMenuFor(null);
                                            }}
                                        >
                                            ✏️ Редактировать
                                        </button>
                                    )}
                                    {mine && onDelete && (
                                        <button
                                            className={`${styles.menuBtn} ${styles.danger}`}
                                            onClick={() => {
                                                setMenuFor(null);
                                                onDelete(m.id);
                                            }}
                                        >
                                            🗑 Удалить
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
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
                                e.currentTarget.value = "";
                            }}
                            hidden
                        />
                    </label>

                    {attached.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            {attached.map((a) => (
                                <AttachedChip
                                    key={a.id}
                                    name={a.name}
                                    progress={a.progress}
                                    thumbUrl={a.thumbUrl}
                                    onRemove={() => setAttached((prev) => prev.filter((x) => x.id !== a.id))}
                                />
                            ))}
                        </div>
                    )}

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
                    <button className={styles.send} onClick={doSend}>
                        Отправить
                    </button>
                </div>
            )}
        </main>
    );
}
