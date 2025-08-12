import styles from "./ChatList.module.css";
import type { Chat } from "../../lib/api";

export function ChatList({ items, activeId, onOpen }:{
    items: Chat[]; activeId: number|null; onOpen:(id:number)=>void;
}) {
    return (
        <aside className={styles.root}>
            <div className={styles.header}>Диалоги</div>
            <div className={styles.list}>
                {items.map(c => {
                    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.title || "?")}`;
                    const statusText = c.isGroup
                        ? ""
                        : c.isOnline
                            ? "онлайн"
                            : c.lastSeenUtc
                                ? formatLastSeen(c.lastSeenUtc)
                                : "";

                    return (
                        <button key={c.id}
                                onClick={()=>onOpen(c.id)}
                                className={`${styles.item} ${activeId===c.id ? styles.active : ""}`}>
                            <div className={styles.avatarWrap}>
                                <img
                                    src={c.avatarUrl || fallback}
                                    onError={(e)=>{ if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }}
                                    className={styles.avatar}
                                    alt=""
                                />
                                {!c.isGroup && c.isOnline && <span className={styles.dot} aria-label="online" />}
                            </div>
                            <div className={styles.meta}>
                                <div className={styles.title}>{c.title}</div>
                                {!c.isGroup && statusText && <div className={styles.sub}>{statusText}</div>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

// простое форматирование "был(а) в сети ..."
function formatLastSeen(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const pad = (n:number)=>String(n).padStart(2,"0");
    const sameDay = d.toDateString() === now.toDateString();
    const ms = now.getTime() - d.getTime();
    if (sameDay) return `был(а) сегодня в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
    if (d.toDateString() === yesterday.toDateString())
        return `был(а) вчера в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `был(а) ${pad(d.getDate())}.${pad(d.getMonth()+1)} в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
