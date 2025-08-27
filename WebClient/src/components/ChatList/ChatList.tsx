// ChatList.tsx
import styles from "./ChatList.module.css";
import type { Chat } from "../../lib/api";
import { toFullUrl, fallbackAvatar } from "../../lib/url";

export function ChatList({
                             items, activeId, onOpen, myId, typingByChat, presence
                         }: {
    items: Chat[];
    activeId: number|null;
    onOpen:(id:number)=>void;
    myId: number;
    typingByChat?: Map<number, Set<number>>;
    presence?: Map<number,{isOnline:boolean;lastSeenUtc?:string|null}>;
}) {

    function fmtTime(iso?: string | null) {
        if (!iso) return "";
        const d = new Date(iso);
        const now = new Date();
        const pad = (n:number)=>String(n).padStart(2,"0");
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
            : `${pad(d.getDate())}.${pad(d.getMonth()+1)}`;
    }

    function formatLastSeen(iso: string) {
        const d = new Date(iso);
        const now = new Date();
        const pad = (n:number)=>String(n).padStart(2,"0");
        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) return `был(а) сегодня в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const y = new Date(now); y.setDate(now.getDate()-1);
        if (d.toDateString() === y.toDateString())
            return `был(а) вчера в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return `был(а) ${pad(d.getDate())}.${pad(d.getMonth()+1)} в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    return (
        <aside className={styles.root}>
            <div className={styles.header}>Диалоги</div>
            <div className={styles.list}>
                {items.map(c => {
                    const src = toFullUrl(c.avatarUrl) || fallbackAvatar(c.title);

                    // чей был последний текст
                    const iAmSender = c.lastSenderId && c.lastSenderId === myId;
                    const previewPrefix = iAmSender ? "Вы: " : "";

                    // печатает…
                    const typingNow = typingByChat?.has(c.id);

                    // presence приоритетнее полей в чате (если прокинут)
                    const info = (!c.isGroup && c.opponentId) ? presence?.get(c.opponentId) : undefined;
                    const isOnline = !!info?.isOnline;
                    const lastSeenUtc = info ? info.lastSeenUtc : (c.lastSeenUtc ?? null);

                    const sub =
                        typingNow ? "печатает…"
                            : (!c.isGroup && !isOnline && lastSeenUtc) ? formatLastSeen(lastSeenUtc)
                                : (c.lastText ? `${previewPrefix}${c.lastText}` : "Нет сообщений");

                    // если сервер даёт unreadCount — используем; иначе = 0
                    const unreadCount = c.unreadCount && c.unreadCount > 0 ? c.unreadCount : 0;

                    return (
                        <button
                            key={c.id}
                            onClick={() => onOpen(c.id)}
                            className={`${styles.item} ${activeId === c.id ? styles.active : ""}`}
                        >
                            <div className={styles.avatarWrap}>
                                <img src={src} className={styles.avatar} alt="" />
                                {!c.isGroup && isOnline ? <span className={styles.dot} /> : null}
                            </div>

                            <div className={styles.body}>
                                <div className={styles.topRow}>
                                    <div className={styles.title}>{c.title}</div>
                                    {unreadCount > 0
                                        ? <div className={styles.unreadBadge}>{unreadCount}</div>
                                        : <div className={styles.time}>{fmtTime(c.lastUtc)}</div>}
                                </div>

                                <div
                                    className={`${styles.preview} ${typingNow ? styles.typing : ""}`}
                                    title={c.lastText || ""}
                                >
                                    {sub}
                                </div>
                            </div>
                        </button>
                    );
                })}



            </div>
        </aside>
    );
}
