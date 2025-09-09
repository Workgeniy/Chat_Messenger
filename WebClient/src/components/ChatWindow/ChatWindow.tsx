
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.locale("ru");
dayjs.extend(localizedFormat);
import styles from "./ChatWindow.module.css";
import { Attachment } from "./Attachment";
import SecureImg from "../common/SecureImg";
import LinkifiedText from "../common/LinkifiedText";
import MembersModal from "../Chats/MembersModal";
import type { Participant as ApiParticipant} from "../../lib/api";

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
    members?: Member[];
    onDirectMessage?: (userId: number) => void;
    onLeaveChat?: () => void;

    onSeen?: (upToMessageId: number) => void;

    onRefreshPeerKey?: () => void;
    onChangeChatAvatar?: (file: File) => Promise<void>;
    onAddMembers?: () => void;

    onBack?: () => void;
    onRemoveMember?: (userId: number) => Promise<void> | void;
};

type Member = ApiParticipant & { isAdmin?: boolean | null };

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
    const [isSending, setIsSending] = useState(false);
    const [autosendAfterUploads, setAutosendAfterUploads] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const [menuFor, setMenuFor] = useState<number | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState("");

    const [showMembers, setShowMembers] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const headerMenuRef = useRef<HTMLDivElement>(null);

    const [showComposerPicker, setShowComposerPicker] = useState(false);

    const [rendered, setRendered] = useState<MsgWithPlain[]>(messages);

    const shouldStickRef = useRef(true);

    const longPressTimersRef = useRef<Map<number, number>>(new Map());

    const lastSeenSentRef = useRef<number | null>(null);



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
        document.title = `ChatFlow — ${props.title ?? "Чат"}`;
    }, [props.title]);

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

    const uploading = useMemo(
                () => attached.some(a => a.id < 0 || (a.progress ?? 0) < 100),
           [attached]
        );



    const presenceLine = useMemo(() => {
        if (props.isGroup) {
            const total = props.members?.length ?? 0;
            const online = (props.members ?? []).filter(m => !!m.isOnline).length; // двойное отрицание
            return total ? `${total} участник${total === 1 ? "" : "ов"} • ${online} в сети` : "";
        } else {
            const opp = (props.members ?? []).find(m => m.id !== userId);
            return formatPresence(opp?.lastSeenUtc, opp?.isOnline ?? null);
        }
    }, [props.isGroup, props.members, userId]);

    useEffect(() => {
                if (autosendAfterUploads && !uploading && !isSending) {
                        void doSend();
                        setAutosendAfterUploads(false);
                    }
            }, [autosendAfterUploads, uploading, isSending]);

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


    useEffect(() => {
        if (!showHeaderMenu) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (headerMenuRef.current && !headerMenuRef.current.contains(t)) setShowHeaderMenu(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setShowHeaderMenu(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onEsc);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
    }, [showHeaderMenu]);

    /** Прикрепление */
    async function pickFile(file: File) {
        const tmpId = -Date.now();
        const thumb = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setAttached((prev) => [...prev, {id: tmpId, name: file.name, progress: 0, thumbUrl: thumb}]);
        try {
            const res = await onUpload(file, (p) => {
                setAttached((prev) => prev.map((x) => (x.id === tmpId ? {...x, progress: p} : x)));
            });
            setAttached((prev) => prev.map((x) => (x.id === tmpId ? {...x, id: res.id, progress: 100} : x)));
        } catch {
            setAttached((prev) => prev.filter((x) => x.id !== tmpId));
            alert("Не удалось загрузить файл");
        }
    }

    async function doSend() {
           if (uploading) { setAutosendAfterUploads(true); return; }
           if (isSending) return;
           const t = text.trim();
           const ids = attached.map(a => a.id).filter(id => id > 0) as number[];
           if (!t && ids.length === 0) return;
           try {
                 setIsSending(true);
                 await Promise.resolve(onSend(t, ids));
                 setText("");
                 setAttached(prev => {
                       prev.forEach(a => a.thumbUrl && URL.revokeObjectURL(a.thumbUrl));
                       return [];
                     });
               } finally {
                 setIsSending(false);
               }
         }


// универсальный опенер контекст-меню, клампит позицию
        function openMenuAt(e: MouseEvent | React.MouseEvent, id: number) {
            // сначала ставим черновую позицию, чтобы элемент отрендерился и у него появились размеры
            setMenuFor(id);
            setMenuPos({x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY});

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

                setMenuPos({x, y});
            });
        }

        function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void doSend();
            }
        }

        function pickChatAvatar(e: React.ChangeEvent<HTMLInputElement>) { //выбор файла для аватарки беседы
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!file || !props.onChangeChatAvatar) return;
            void props.onChangeChatAvatar(file).finally(() => setShowHeaderMenu(false));
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
            const y = r.top + r.height / 2;

            const t = window.setTimeout(() => {
                openMenuAt({clientX: x, clientY: y} as any, id);
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

        function formatPresence(iso?: string | null, online?: boolean | null) {
            if (online) return "в сети";
            if (!iso) return "был(а) давно";
            const d = dayjs(iso);
            const now = dayjs();
            if (now.diff(d, "minute") < 1) return "был(а) только что";
            if (now.isSame(d, "day")) return `был(а) в ${d.format("HH:mm")}`;
            if (now.subtract(1, "day").isSame(d, "day")) return `был(а) вчера в ${d.format("HH:mm")}`;
            return `был(а) ${d.format("DD MMMM YYYY в HH:mm")}`;
        }

        /** Рендер сообщения */
        function renderMessage(m: MsgWithPlain) {
            const mine = m.senderId === userId;
            const isEditing = editingId === m.id;

            const sender = (members ?? []).find(u => u.id === m.senderId);
            const others = (members ?? []).filter(u => u.id !== userId);
            const seenCount = others.filter(u => (u.lastSeenMessageId ?? 0) >= m.id).length;

            const avatarSrc =
                mine ? (props.myAvatarUrl ?? sender?.avatarUrl ?? undefined)
                    : (sender?.avatarUrl ?? undefined);
            const avatarSeed = mine ? "Me" : (sender?.name || "U");

            return (
                <div key={`msg:${m.id}`} className={`${styles.msgRow} ${mine ? styles.rowMine : styles.rowTheir}`}>
                    {/* аватар возле пузыря */}
                    <SecureImg
                        src={avatarSrc}
                        alt=""
                        className={styles.msgAvatar}
                        fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(avatarSeed)}`}
                    />

                    <div
                        className={`${styles.bubble} ${mine ? styles.mine : styles.their} ${mine ? styles.tailRight : styles.tailLeft}`}
                        onMouseDown={(e) => {
                            if (m.isDeleted || editingId !== null) return;
                            const target = e.target as HTMLElement;

                            if (target.closest('a,button,input,textarea,video,audio,img')) return;
                            e.stopPropagation();
                            openMenuAt(e.nativeEvent, m.id);
                        }}
                        onContextMenu={(e) => {
                            if (m.isDeleted || editingId !== null) return;
                            const target = e.target as HTMLElement;
                            if (target.closest('a,button,input,textarea,video,audio,img')) return;
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
                                    <button onClick={() => {
                                        setEditingId(null);
                                        setEditText("");
                                        setMenuFor(null);
                                    }}>
                                        Отмена
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>     {props.isGroup && (
                                <div className={styles.senderName}>{mine ? "Вы" : (sender?.name || "—")}</div>
                            )}

                                {(m.plaintext ?? m.text) && (
                                    <div className={styles.text}>
                                        <LinkifiedText text={(m.plaintext ?? m.text) as string}/>
                                    </div>
                                )}

                                {m.attachments?.length ? (
                                    <div
                                        className={styles.attachments}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchEnd={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                    >
                                        {m.attachments.map(a =>
                                            <Attachment key={`att:${m.id}:${a.id}`} a={a}/>
                                        )}
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
                            {mine && <span
                                className={`${styles.ticks} ${seenCount > 0 ? styles.double : styles.single}`}>{seenCount > 0 ? " ✓✓" : " ✓"}</span>}
        </span>
                    </div>

                </div>
            );
        }

        return (

            <main className={styles.root}>
                {/* Header */}
                <header className={styles.header}>
                    <div style={{display: "flex", alignItems: "center", gap: 10, width: "100%"}}>
                        {props.onBack && (
                            <button
                                type="button"
                                className={styles.backBtn}
                                onClick={props.onBack}
                                aria-label="Назад"
                            >
                                ←
                            </button>
                        )}

                        {avatarUrl && (
                            <SecureImg
                                src={avatarUrl}
                                alt=""
                                style={{width: 32, height: 32, borderRadius: "50%"}}
                                fallback={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(title || "U")}`}
                            />
                        )}

                        {/* Контейнер заголовка — позиционируем меню относительно него */}
                        <div style={{display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0, position: "relative"}}>
      <span
          className={props.isGroup ? styles.titleClickable : undefined}
          style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}
          title={props.isGroup ? "Открыть меню беседы" : undefined}
          onClick={() => {
              if (props.isGroup) setShowHeaderMenu(v => !v);
          }}
      >
        {title ?? "Выберите чат"}
      </span>

                            {typingUsers.length ? (
                                <span className={styles.typing} style={{fontSize: 12}}>
          {typingUsers.join(", ")} печатает…
        </span>
                            ) : presenceLine ? (
                                <span className={styles.typing} style={{fontSize: 12}}>
          {presenceLine}
        </span>
                            ) : null}

                            {/* Меню беседы — только для групп, открывается по клику на title */}
                            {props.isGroup && showHeaderMenu && (
                                <div
                                    ref={headerMenuRef}
                                    className={styles.dropdown}
                                    style={{left: 0, right: "auto", top: "calc(100% + 8px)"}}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowMembers(true);
                                            setShowHeaderMenu(false);
                                        }}
                                        className={styles.menuItem}
                                        style={{background: "transparent"}}
                                    >
                                        👥 Участники
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowHeaderMenu(false);
                                            props.onAddMembers?.();
                                        }}
                                        className={styles.menuItem}
                                        style={{background: "transparent", marginTop: 4}}
                                    >
                                        ➕ Добавить участника
                                    </button>

                                    <label style={{display: "block", cursor: "pointer", padding: "8px 10px", marginTop: 6}}>
                                        🖼 Сменить аватар беседы
                                        <input type="file" accept="image/*" hidden onChange={pickChatAvatar}/>
                                    </label>

                                    <div style={{height: 1, background: "#eee", margin: "6px 0"}}/>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowHeaderMenu(false);
                                            props.onLeaveChat?.();
                                        }}
                                        className={styles.menuItem}
                                        style={{color: "#b42318", background: "transparent"}}
                                    >
                                        🚪 Выйти из беседы
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                </header>




                {/* Messages */}
                <div
                    ref={listRef}
                    className={styles.list}
                    onScroll={onScroll}
                    style={attached.length ? {paddingBottom: "120px"} : undefined}
                >
                    {itemsWithDateBreaks.map(it =>
                        it.kind === "date"
                            ? <div key={it.key} className={styles.dateDivider}><span>{it.label}</span></div>
                            : renderMessage(it.m)
                    )}
                    <div ref={bottomRef}/>
                </div>

                {/* Context menu */}
                {menuFor !== null && (
                    <div ref={menuRef} className={styles.ctxMenu} style={{left: menuPos.x, top: menuPos.y}}
                         onMouseDown={(e) => e.stopPropagation()}>
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

                        <div className={styles.menuLine}/>
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
                        <label className={`${styles.attach} ${attached.length ? styles.attachHas : ""}`}>
                            📎
                            {attached.length > 0 && <span className={styles.attachBadge}>{attached.length}</span>}
                            <input
                                type="file"
                                multiple
                                hidden
                                onChange={(e) => {
                                    Array.from(e.target.files || []).forEach(pickFile);
                                    e.currentTarget.value = "";
                                }}
                            />
                        </label>

                        <button
                            type="button"
                            className={styles.emojiComposerBtn}
                            onClick={() => setShowComposerPicker(v => !v)}
                        >
                            😀
                        </button>

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
                            type="button"
                            className={styles.send}
                            onClick={() => void doSend()}
                            disabled={uploading || isSending}
                            aria-label="Отправить"
                            title={uploading ? "Дождитесь загрузки вложений…" : "Отправить"}
                        >
                            <svg viewBox="0 0 24 24" fill="none">
                                <path d="M3 11.5l17-8-7.5 17-2-7-7.5-2z" stroke="currentColor" strokeWidth="1.6"
                                      fill="currentColor"/>
                            </svg>
                        </button>
                        {showComposerPicker && (
                            <div className={styles.emojiPickerComposer}
                                 onMouseLeave={() => setShowComposerPicker(false)}>
                                {EMOJIS.concat(["😉", "😅", "🤔", "🙏"]).map((e) => (
                                    <button
                                        type="button"
                                        key={e}
                                        className={styles.emojiBtn}
                                        onClick={() => {
                                            setText(t => (t ? `${t} ${e}` : e));
                                            setShowComposerPicker(false);
                                        }}
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                        )}

                        {attached.length > 0 && (
                            <div className={styles.attachedRow}>
                                {attached.slice(0, 4).map(a => (
                                    <div key={a.id} className={styles.attachedThumb} title={a.name}>
                                        {a.thumbUrl
                                            ? <img src={a.thumbUrl} alt=""/>
                                            : <span className={styles.attachedFileIcon}>📄</span>}
                                        {(a.progress ?? 0) < 100 && (
                                            <span className={styles.attachedProgress}>
                                        {(a.progress ?? 0) | 0}%
                                      </span>
                                        )}
                                        <button
                                            type="button"
                                            className={styles.attachedRemove}
                                            onClick={() => setAttached(prev => {
                                                const f = prev.find(x => x.id === a.id);
                                                if (f?.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
                                                return prev.filter(x => x.id !== a.id);
                                            })}
                                            aria-label="Убрать файл"
                                        >
                                        </button>
                                    </div>
                                ))}
                                {attached.length > 4 && (<div className={styles.attachedMore}>+{attached.length - 4}</div>)
                                }
                            </div>
                        )}

                    </div>

                )}
                {showMembers && (
                    <MembersModal
                        open={showMembers}
                        onClose={() => setShowMembers(false)}
                        members={props.members ?? []}
                        myId={userId}
                        onDM={(uid: number) => {
                            setShowMembers(false);
                            props.onDirectMessage?.(uid);
                        }}
                        isGroup={!!props.isGroup}
                        onRemoveMember={async (uid: number) => {
                            setShowMembers(false);
                            await props.onRemoveMember?.(uid);
                        }}
                    />
                )}


            </main>
        );
    }
