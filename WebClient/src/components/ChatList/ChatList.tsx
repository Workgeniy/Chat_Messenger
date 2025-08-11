import styles from "./ChatList.module.css";
import type { Chat } from "../../lib/api";

type Props = {
    items: Chat[];
    activeId: number | null;
    onOpen: (id: number) => void;
};

export function ChatList({ items, activeId, onOpen }: Props) {
    return (
        <aside className={styles.root}>
            <div className={styles.header}>Диалоги</div>

            <div className={styles.list}>
                {items.map((c) => {
                    const isActive = activeId === c.id;
                    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        c.title || "?"
                    )}`;

                    return (
                        <button
                            key={c.id}
                            onClick={() => onOpen(c.id)}
                            className={`${styles.item} ${isActive ? styles.active : ""}`}
                            aria-pressed={isActive}
                            title={c.title}
                        >
                            <img
                                src={c.avatarUrl || fallback}
                                onError={(e) => {
                                    const img = e.currentTarget;
                                    if (img.src !== fallback) img.src = fallback;
                                }}
                                className={styles.avatar}
                                alt=""
                                loading="lazy"
                                width={36}
                                height={36}
                            />

                            <div className={styles.title}>{c.title}</div>

                            {/* если сервер отдаёт счетчик */}
                            {typeof (c as any).unread === "number" && (c as any).unread > 0 && (
                                <span className={styles.unread}>{(c as any).unread}</span>
                            )}
                        </button>
                    );
                })}

                {items.length === 0 && (
                    <div className={styles.empty}>Пока нет диалогов</div>
                )}
            </div>
        </aside>
    );
}
