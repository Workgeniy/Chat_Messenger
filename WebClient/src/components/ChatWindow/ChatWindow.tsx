
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.locale("ru");
dayjs.extend(localizedFormat);
import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";
import { AttachedChip } from "./AttachedChip";
import { getPinnedFingerprint, formatSafetyCode } from "../../lib/crypto";
import SecureImg from "../common/SecureImg.tsx";

/** ----- Types ----- */
type MsgWithPlain = Msg & { plaintext?: string };

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
    lastSeenMessageId?: number | null;
};

type Props = {
    title?: string;
    avatarUrl?: string;
    myAvatarUrl?: string;
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

    onRefreshPeerKey?: () => void;
};

const MENU_PADDING = 8;

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "😍", "😎", "🎉"];



export default function ChatWindow(props: Props) {
    const {
        title, avatarUrl, userId, messages,
        onSend, onUpload, onTyping, typingUsers, onLoadOlder,
        onEdit, onDelete, onReact, onUnreact, members, onSeen
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

    const [rendered, setRendered] = useState<MsgWithPlain[]>(messages);

    const shouldStickRef = useRef(true);

    const longPressTimersRef = useRef<Map<number, number>>(new Map());

    const lastSeenSentRef = useRef<number | null>(null);

    const opponentId = useMemo(() => {
        if (props.isGroup) return null;
        const other = (props.members ?? []).find(m => m.id !== userId);
        return other?.id ?? null;
    }, [props.isGroup, props.members, userId]);

    const [showSec, setShowSec] = useState(false);
    const tofu = opponentId ? getPinnedFingerprint(opponentId) : null;
    const safety = tofu ? formatSafetyCode(tofu.fp) : "не подтверждено";

    useEffect(() => { setRendered(messages as MsgWithPlain[]); }, [messages]);

    useEffect(() => {
        if (!onSeen || messages.length === 0) return;
        const lastId = messages[messages.length - 1].id;
        if (lastSeenSentRef.current !== lastId) {
            onSeen(lastId);
            lastSeenSentRef.current = lastId;
        }
    }, [messages.length, onSeen]);


    useEffect(() => {
        if (!showSec) return;
        const h = (e: MouseEvent) => {
            const p = (e.target as Node);
            const pop = document.querySelector(`.${styles.secPopover}`);
            const btn = document.querySelector(`.${styles.secBtn}`);
            if (pop && !pop.contains(p) && btn && !btn.contains(p)) setShowSec(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [showSec]);


    /** Группировка по датам */
    const itemsWithDateBreaks = useMemo(() => {
        const res: Array<{ kind: "date"; label: string; key: string } | { kind: "msg"; m: MsgWithPlain }> = [];
        let lastDay = -1;
        for (const m of rendered) {
            const dayKey = dayjs(m.sentUtc).startOf("day").valueOf();
            if (dayKey !== lastDay) {
                res.push({ kind: "date", label: dayjs(m.sentUtc).format("DD MMMM YYYY"), key: `d-${dayKey}` });
                lastDay = dayKey;
            }
            res.push({ kind: "msg", m });
        }
        return res;
    }, [rendered]);

    /** ----- Автоскролл ----- */
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el) return;
        shouldStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    });
    useEffect(() => { if (shouldStickRef.current) stickToBottom(); }, [messages.length]);
    useEffect(() => { stickToBottom(true); }, []);

    function stickToBottom(force = false) {
        const el = listRef.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (force || near) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.scrollTop = el.scrollHeight;
                });
            });
        }
    }



    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const imgs = el.querySelectorAll('img');
        const fn = () => { if (shouldStickRef.current) stickToBottom(); };
        imgs.forEach(img => img.addEventListener('load', fn, { once: true }));
        return () => imgs.forEach(img => img.removeEventListener('load', fn));
    }, [messages.length]);

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

    useEffect(() => {
        const onResize = () => {
            // если меню открыто — переклампим позицию к центру окна
            if (menuFor !== null) {
                const centerEvt = { clientX: window.innerWidth - MENU_PADDING, clientY: window.innerHeight - MENU_PADDING } as MouseEvent;
                openMenuAt(centerEvt, menuFor);
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [menuFor]);

// закрываем при скролле списка (и в родителе)
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const onScrollHide = () => setMenuFor(null);
        el.addEventListener("scroll", onScrollHide, { passive: true });
        return () => el.removeEventListener("scroll", onScrollHide);
    }, []);

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


// универсальный опенер контекст-меню, клампит позицию
    function openMenuAt(e: MouseEvent | React.MouseEvent, id: number) {
        // сначала ставим черновую позицию, чтобы элемент отрендерился и у него появились размеры
        setMenuFor(id);
        setMenuPos({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });

        // после рендера узнаём размеры и клампим
        requestAnimationFrame(() => {
            const el = menuRef.current;
            if (!el) return;

            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let x = (e as MouseEvent).clientX;
            let y = (e as MouseEvent).clientY;

            // если не влезает вправо/вниз — двигаем влево/вверх
            if (x + w + MENU_PADDING > vw) x = Math.max(MENU_PADDING, vw - w - MENU_PADDING);
            if (y + h + MENU_PADDING > vh) y = Math.max(MENU_PADDING, vh - h - MENU_PADDING);

            // если слишком близко к левому/верхнему краю — даём минимальный отступ
            if (x < MENU_PADDING) x = MENU_PADDING;
            if (y < MENU_PADDING) y = MENU_PADDING;

            setMenuPos({ x, y });
        });
    }

    // закрыть контекстное меню по клику вне и по Escape
    useEffect(() => {
        if (menuFor === null) return;

        const onDocMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            // если клик внутри меню — не закрываем
            if (menuRef.current && menuRef.current.contains(t)) return;
            setMenuFor(null);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenuFor(null);
        };

        document.addEventListener("mousedown", onDocMouseDown); // bubbling (по умолчанию)
        document.addEventListener("keydown", onKey);

        return () => {
            document.removeEventListener("mousedown", onDocMouseDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuFor]);

    function startLongPress(id: number, el: HTMLElement, ms = 450) {
        // откроем меню по центру пузыря
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top  + r.height / 2;

        const t = window.setTimeout(() => {
            openMenuAt({ clientX: x, clientY: y } as any, id);
        }, ms);

        longPressTimersRef.current.set(id, t);
    }

    function stopLongPress(id: number) {
        const t = longPressTimersRef.current.get(id);
        if (t) {
            clearTimeout(t);
            longPressTimersRef.current.delete(id);
        }
    }

    /** Рендер сообщения */
    function renderMessage(m: MsgWithPlain) {
        const mine = m.senderId === userId;
        const isEditing = editingId === m.id;
        const others = (members ?? []).filter(u => u.id !== userId);
        const seenCount = others.filter(u => (u.lastSeenMessageId ?? 0) >= m.id).length;

        return (
            <div key={m.id} className={`${styles.msgRow} ${mine ? styles.rowMine : styles.rowTheir}`}>
                <div
                    className={`${styles.bubble} ${mine ? styles.mine : styles.their} ${mine ? styles.tailRight : styles.tailLeft}`}
                    onMouseDown={(e) => {
                        if (m.isDeleted || editingId !== null) return;
                        e.stopPropagation();
                        openMenuAt(e.nativeEvent, m.id);
                    }}
                    onContextMenu={(e) => {
                        if (m.isDeleted || editingId !== null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        openMenuAt(e.nativeEvent, m.id);
                    }}
                    onTouchStart={(e) => startLongPress(m.id, e.currentTarget)}
                    onTouchEnd={() => stopLongPress(m.id)}
                    onTouchMove={() => stopLongPress(m.id)}
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
                                        const base = (m.plaintext ?? m.text ?? "").toString();
                                        if (nt && nt !== base && onEdit) {
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
                                        const base = (m.plaintext ?? m.text ?? "").toString();
                                        if (nt && nt !== base && onEdit) {
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
                                <button onClick={() => { setEditingId(null); setEditText(""); setMenuFor(null); }}>
                                    Отмена
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            { (m.plaintext ?? m.text) && (
                                <div className={styles.text}>{m.plaintext ?? m.text}</div>
                            )}
                            {m.attachments?.length ? (
                                <div
                                    className={styles.attachments}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onTouchEnd={(e) => e.stopPropagation()}
                                    onTouchMove={(e) => e.stopPropagation()}
                                >
                                    {m.attachments.map(a => <Attachment key={`att:${a.id}`} a={a} />)}
                                </div>
                            ) : null}
                        </>
                    )}

                    {/* Реакции под текстом */}
                    {!!m.reactions?.length && (
                        <div className={styles.reactionsRow} onMouseDown={(e) => e.stopPropagation()}>
                            {m.reactions.map((r) => (
                                <button
                                    type="button"
                                    key={r.emoji}
                                    className={`${styles.reaction} ${r.mine ? styles.reactionMine : ""}`}
                                    title={r.mine ? "Убрать реакцию" : "Поставить реакцию"}
                                    onMouseDown={(ev) => {
                                        ev.preventDefault();
                                        ev.stopPropagation();
                                        if (r.mine && onUnreact) onUnreact(m.id, r.emoji);
                                        else if (onReact) onReact(m.id, r.emoji);
                                    }}
                                >
                                    {r.emoji} {r.count > 1 ? r.count : ""}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* мета справа снизу */}
                    <span className={styles.metaRight}>
            {dayjs(m.sentUtc).format("HH:mm")}
                        {m.senderId === userId && (
                            <span className={`${styles.ticks} ${seenCount > 0 ? styles.double : styles.single}`}>
                {seenCount > 0 ? " ✓✓" : " ✓"}
              </span>
                        )}
          </span>
                </div>
            </div>
        );
    }

    return (
        <main className={styles.root}>
            {/* Header */}
            <header className={styles.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {avatarUrl && (
                        <SecureImg
                            src={avatarUrl}
                            alt=""
                            style={{ width: 32, height: 32, borderRadius: "50%" }}
                            fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(title || "U")}`}
                        />
                    )}

                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <span>{title ?? "Выберите чат"}</span>
                        {!!typingUsers.length && (
                            <span className={styles.typing} style={{ fontSize: 12 }}>
          {typingUsers.join(", ")} печатает…
        </span>
                        )}
                    </div>

                    {/* 🔐 кнопка справа от заголовка */}
                    {!props.isGroup && opponentId && (
                        <div style={{ position: "relative", marginLeft: 8 }}>
                            <button
                                type="button"
                                className={styles.secBtn}
                                title="Код безопасности"
                                onClick={() => setShowSec(v => !v)}
                            >
                                🔐
                            </button>
                            {showSec && (
                                <div className={styles.secPopover} onMouseLeave={() => setShowSec(false)}>
                                    <div className={styles.secTitle}>Код безопасности</div>
                                    <div className={styles.secCode}>{safety}</div>
                                    {tofu?.changed && <div className={styles.secWarn}>Отпечаток изменился</div>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>



            {/* Messages */}
            <div ref={listRef} className={styles.list} onScroll={onScroll}>
                {itemsWithDateBreaks.map(it =>
                    it.kind === "date"
                        ? <div key={it.key} className={styles.dateDivider}><span>{it.label}</span></div>
                        : renderMessage(it.m)
                )}
                <div ref={bottomRef} />
            </div>

            {/* Context menu */}
            {menuFor !== null && (
                <div ref={menuRef} className={styles.ctxMenu} style={{ left: menuPos.x, top: menuPos.y }} onMouseDown={(e) => e.stopPropagation()}>
                    <div className={styles.emojiGrid}>
                        {EMOJIS.map((e) => (
                            <button
                                type="button"
                                key={e}
                                className={styles.emojiBtn}
                                onMouseDown={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    const id = menuFor!;
                                    onReact?.(id, e);
                                    setMenuFor(null);
                                }}
                            >
                                {e}
                            </button>
                        ))}
                    </div>

                    <div className={styles.menuLine} />
                    {(() => {
                        const m = rendered.find((x) => x.id === menuFor);
                        if (!m || m.isDeleted) return null;
                        const mine = m.senderId === userId;
                        return (
                            <div className={styles.menuActions}>
                                {mine && onEdit && (
                                    <button
                                        type="button"
                                        className={styles.menuBtn}
                                        onMouseDown={(ev) => {
                                            ev.preventDefault();
                                            ev.stopPropagation();
                                            setEditingId(m.id);
                                            setEditText((m.plaintext ?? m.text ?? ""));
                                            setMenuFor(null);
                                        }}
                                    >
                                        ✏️ Редактировать
                                    </button>
                                )}
                                {mine && onDelete && (
                                    <button
                                        type="button"
                                        className={`${styles.menuBtn} ${styles.danger}`}
                                        onMouseDown={(ev) => {
                                            ev.preventDefault();
                                            ev.stopPropagation();
                                            setMenuFor(null);
                                            onDelete?.(m.id);
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
