// src/components/ChatWindow/ChatWindow.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.locale("ru");
dayjs.extend(localizedFormat);

import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";
import { AttachedChip } from "./AttachedChip";

/** ----- Types ----- */
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

type Participant = {
    id: number;
    name: string;
    avatarUrl?: string | null;
    lastSeenMessageId?: number | null;   // ✅ добавлено
};

type Props = {
    title?: string;
    avatarUrl?: string;
    userId: number;
    messages: Msg[];

    onSend: (text: string, attachments?: number[]) => Promise<void> | void;
    onUpload: (file: File, onProgress?: (p: number) => void) => Promise<{ id: number; url?: string }>;
    onTyping: () => void;

    typingUsers: string[];
    onLoadOlder?: () => Promise<void> | void;

    onEdit?: (id: number, text: string) => Promise<void> | void;
    onDelete?: (id: number) => Promise<void> | void;
    onReact?: (id: number, emoji: string) => Promise<void> | void;
    onUnreact?: (id: number, emoji: string) => Promise<void> | void;

    isGroup?: boolean;
    members?: Participant[];
    onDirectMessage?: (userId: number) => void;
    onLeaveChat?: () => void;

    onSeen?: (upToMessageId: number) => void;
};

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "😍", "😎", "🎉"];

export default function ChatWindow(props: Props) {
    const {
        title, avatarUrl, userId, messages,
        onSend, onUpload, onTyping, typingUsers, onLoadOlder,
        onEdit, onDelete, onReact, onUnreact,
        isGroup, members, onDirectMessage, onLeaveChat, onSeen
    } = props;

    const [text, setText] = useState("");
    const [attached, setAttached] = useState<Pending[]>([]);
    const listRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [menuFor, setMenuFor] = useState<number | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState("");

    const [showComposerPicker, setShowComposerPicker] = useState(false);

    const shouldStickRef = useRef(true);

    const [headMenuOpen, setHeadMenuOpen] = useState(false);
    const headMenuRef = useRef<HTMLDivElement>(null);

    /** Группировка по датам */
    const itemsWithDateBreaks = useMemo(() => {
        const res: Array<{ kind: "date"; label: string } | { kind: "msg"; m: Msg }> = [];
        let last: string | null = null;
        for (const m of messages) {
            const label = dayjs(m.sentUtc).format("DD MMMM YYYY");
            if (label !== last) {
                res.push({ kind: "date", label });
                last = label;
            }
            res.push({ kind: "msg", m });
        }
        return res;
    }, [messages]);

    /** ----- Автоскролл ----- */
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el) return;
        shouldStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    });

    useLayoutEffect(() => {
        if (shouldStickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
    }, [messages.length]);

    useLayoutEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, []);

    /** Закрытие меню (контекст/шапка) */
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!headMenuOpen) return;
            const t = e.target as Node;
            if (headMenuRef.current && !headMenuRef.current.contains(t)) {
                setHeadMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setHeadMenuOpen(false);
                setMenuFor(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [headMenuOpen]);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (menuFor === null) return;
            const t = e.target as HTMLElement;
            if (menuRef.current && menuRef.current.contains(t)) return;
            requestAnimationFrame(() => setMenuFor(null));
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [menuFor]);

    /** Подгрузка истории */
    async function onScroll() {
        const el = listRef.current;
        if (!el || !onLoadOlder) return;
        if (el.scrollTop < 40) {
            const prev = el.scrollHeight;
            await onLoadOlder();
            const added = (listRef.current?.scrollHeight ?? 0) - prev;
            el.scrollTop = el.scrollTop + added;
        }
    }

    /** Input */
    function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void doSend();
        }
    }

    /** Прикрепление */
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

    /** Отметка о прочтении */
    useEffect(() => {
        if (!onSeen || messages.length === 0) return;
        onSeen(messages[messages.length - 1].id);
    }, [messages.length]);

    /** Рендер сообщения */
    function renderMessage(m: Msg) {
        const mine = m.senderId === userId;
        const isEditing = editingId === m.id;
        const others = (members ?? []).filter(u => u.id !== userId);
        const seenCount = others.filter(u => (u.lastSeenMessageId ?? 0) >= m.id).length;
        const seenAll = others.length > 0 && seenCount === others.length;
        const seenAny = seenCount > 0;

        return (
            <div
                key={m.id}
                className={`${styles.bubble} ${mine ? styles.mine : styles.their}`}
                onClick={(e) => {
                    if (m.isDeleted) return;
                    e.stopPropagation();
                    setMenuFor(m.id);
                    setMenuPos({ x: e.clientX, y: e.clientY });
                }}
                onContextMenu={(e) => {
                    if (m.isDeleted) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuFor(m.id);
                    setMenuPos({ x: e.clientX, y: e.clientY });
                }}
            >
                {m.isDeleted ? (
                    <div className={styles.deleted}>Сообщение удалено</div>
                ) : isEditing ? (
                    <div className={styles.editWrap} onClick={(e) => e.stopPropagation()}>
                        <input
                            className={styles.editInput}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    const nt = editText.trim();
                                    if (nt && nt !== m.text && onEdit) {
                                        Promise.resolve(onEdit(m.id, nt)).finally(() => {
                                            setEditingId(null); setEditText(""); setMenuFor(null);
                                        });
                                    } else { setEditingId(null); setEditText(""); setMenuFor(null); }
                                }
                                if (e.key === "Escape") { setEditingId(null); setEditText(""); setMenuFor(null); }
                            }}
                            autoFocus
                            placeholder="Изменить сообщение"
                        />
                    </div>
                ) : (
                    <>
                        {m.text && <div>{m.text}</div>}
                        {m.attachments?.length ? (
                            <div className={styles.attachments} onClick={(e) => e.stopPropagation()}>
                                {m.attachments.map((a) => <Attachment key={String(a.id)} a={a} />)}
                            </div>
                        ) : null}
                    </>
                )}

                {!m.isDeleted && !!m.reactions?.length && (
                    <div className={styles.reactionsRow} onClick={(e) => e.stopPropagation()}>
                        {m.reactions.map((r) => (
                            <button
                                type="button"
                                key={r.emoji}
                                className={`${styles.reaction} ${r.mine ? styles.reactionMine : ""}`}
                                onClick={() => {
                                    if (r.mine && onUnreact) onUnreact(m.id, r.emoji);
                                    else if (onReact) onReact(m.id, r.emoji);
                                }}
                            >
                                {r.emoji} {r.count > 1 ? r.count : ""}
                            </button>
                        ))}
                    </div>
                )}

                <div className={styles.time}>
                    {dayjs(m.sentUtc).format("HH:mm")}
                    {m.editedUtc ? <span className={styles.edited}>&nbsp;(изменено)</span> : null}
                    {m.senderId === userId && (
                        <span className={`${styles.ticks} ${seenAll ? styles.seenAll : seenAny ? styles.seenSome : ""}`}>
              {seenAny ? "✓✓" : "✓"}
            </span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <main className={styles.root}>
            {/* Header */}
            <header className={styles.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {avatarUrl && <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />}
                    <span>{title ?? "Выберите чат"}</span>
                </div>
                {!!typingUsers.length && <span className={styles.typing}>{typingUsers.join(", ")} печатает…</span>}
                <div className={styles.headerActions} ref={headMenuRef}>
                    <button type="button" className={styles.kebabBtn} onClick={() => setHeadMenuOpen(v => !v)}>⋯</button>
                    {headMenuOpen && (
                        <div className={styles.dropdown}>
                            {isGroup && members?.length ? (
                                <>
                                    <div className={styles.menuSectionTitle}>Участники</div>
                                    <div className={styles.usersList}>
                                        {members.map(u => (
                                            <button
                                                type="button"
                                                key={u.id}
                                                className={styles.userItem}
                                                onClick={() => { setHeadMenuOpen(false); onDirectMessage?.(u.id); }}
                                            >
                                                {u.avatarUrl
                                                    ? <img src={u.avatarUrl} alt="" className={styles.userAvatar} />
                                                    : <div className={styles.userAvatarFallback}>{u.name?.[0] ?? "U"}</div>}
                                                <span className={styles.userName}>{u.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.menuLine} />
                                </>
                            ) : null}
                            {isGroup && onLeaveChat && (
                                <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={() => { setHeadMenuOpen(false); onLeaveChat(); }}>
                                    Выйти из беседы
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Messages */}
            <div ref={listRef} className={styles.list} onScroll={onScroll}>
                {itemsWithDateBreaks.map((it, i) =>
                    it.kind === "date"
                        ? <div key={`d-${i}`} className={styles.dateDivider}><span>{it.label}</span></div>
                        : renderMessage(it.m)
                )}
                <div ref={bottomRef} />
            </div>

            {/* Context menu */}
            {menuFor !== null && (
                <div ref={menuRef} className={styles.ctxMenu} style={{ left: menuPos.x, top: menuPos.y }}>
                    <div className={styles.emojiGrid}>
                        {EMOJIS.map((e) => (
                            <button type="button" key={e} className={styles.emojiBtn} onClick={() => { onReact?.(menuFor, e); setMenuFor(null); }}>
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
                                    <button type="button" className={styles.menuBtn} onClick={() => { setEditingId(m.id); setEditText(m.text ?? ""); setMenuFor(null); }}>
                                        ✏️ Редактировать
                                    </button>
                                )}
                                {mine && onDelete && (
                                    <button type="button" className={`${styles.menuBtn} ${styles.danger}`} onClick={() => { setMenuFor(null); onDelete(m.id); }}>
                                        🗑 Удалить
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Composer */}
            {!!title && (
                <div className={styles.composer}>
                    <label className={styles.attach}>
                        📎
                        <input type="file" multiple hidden onChange={(e) => { Array.from(e.target.files || []).forEach(pickFile); e.currentTarget.value = ""; }} />
                    </label>
                    <button type="button" className={styles.emojiComposerBtn} onClick={() => setShowComposerPicker(v => !v)}>😀</button>
                    {showComposerPicker && (
                        <div className={styles.emojiPickerComposer} onMouseLeave={() => setShowComposerPicker(false)}>
                            {EMOJIS.concat(["😉", "😅", "🤔", "🙏"]).map((e) => (
                                <button type="button" key={e} className={styles.emojiBtn} onClick={() => { setText(t => (t ? `${t} ${e}` : e)); setShowComposerPicker(false); }}>
                                    {e}
                                </button>
                            ))}
                        </div>
                    )}
                    {attached.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            {attached.map((a) => (
                                <AttachedChip key={a.id} name={a.name} progress={a.progress} thumbUrl={a.thumbUrl} onRemove={() => setAttached(prev => prev.filter(x => x.id !== a.id))} />
                            ))}
                        </div>
                    )}
                    <input className={styles.input} placeholder="Сообщение..." value={text} onChange={(e) => { setText(e.target.value); onTyping(); }} onKeyDown={keyDown} />
                    <button type="button" className={styles.send} onClick={() => void doSend()}>Отправить</button>
                </div>
            )}
        </main>
    );
}
