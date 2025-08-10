import styles from "./ChatList.module.css";

export type Chat = { id: number; title: string; unread: number };

export function ChatList({ items, activeId, onOpen }: {
    items: Chat[]; activeId: number | null; onOpen: (id: number) => void;
}) {
    return (
        <aside className={styles.sidebar}>
            <div className={styles.header}>Чаты</div>
            <div className={styles.list}>
                {items.map(c => (
                    <button key={c.id}
                            className={`${styles.item} ${activeId === c.id ? styles.active : ""}`}
                            onClick={() => onOpen(c.id)}>
                        <div className={styles.title}>{c.title}</div>
                        {!!c.unread && <div className={styles.unread}>{c.unread}</div>}
                    </button>
                ))}
            </div>
        </aside>
    );
}
