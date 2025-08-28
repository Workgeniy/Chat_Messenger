import { useEffect, useRef, useState } from "react";
import { api, type FoundUser } from "../../lib/api";
import styles from "./SearchUsersModal.module.css";

type Props = {
    onClose: () => void;
    onPick: (chatId: number) => void;
    currentUserId: number;
};

export default function SearchUsersModal({ onClose, onPick, currentUserId }: Props) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const reqIdRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Блокируем прокрутку фона
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Закрытие по ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Автофокус
    useEffect(() => { inputRef.current?.focus(); }, []);

    // Поиск с дебаунсом и защитой от гонок
    useEffect(() => {
        setErr(null);

        const handler = setTimeout(async () => {
            const query = q.trim();
            if (!query) { setItems([]); setLoading(false); return; }

            const myId = ++reqIdRef.current;
            try {
                setLoading(true);
                const found = await api.searchUsers(query);
                if (reqIdRef.current !== myId) return; // устаревший ответ
                const filtered = found.filter(u => u.id !== currentUserId);
                setItems(filtered);
            } catch (e: any) {
                if (reqIdRef.current !== myId) return;
                setErr(e?.message ?? "Ошибка поиска");
            } finally {
                if (reqIdRef.current === myId) setLoading(false);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [q, currentUserId]);

    const fallback = (name?: string) =>
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || "U")}`;

    async function writeTo(userId: number) {
        const chat = await api.startChatWith(userId);
        onPick(chat.id);
    }

    return (
        <div className={styles.backdrop} onMouseDown={onClose}>
            <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className={styles.input}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Поиск по имени или email"
                />

                {err && <div className={styles.error}>{err}</div>}

                <div className={styles.list}>
                    {loading && <div className={styles.row}>Ищем…</div>}

                    {items.map((u) => (
                        <div className={styles.row} key={u.id}>
                            <img
                                className={styles.avatar}
                                src={u.avatarUrl || fallback(u.name)}
                                onError={(e) => {
                                    const fb = fallback(u.name);
                                    if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                                }}
                                alt=""
                            />
                            <div className={styles.meta}>
                                <div className={styles.name}>{u.name}</div>
                                <div className={styles.email}>{u.email}</div>
                            </div>
                            <button className={styles.primary} onClick={() => void writeTo(u.id)}>
                                Написать
                            </button>
                        </div>
                    ))}

                    {!loading && !err && q.trim() && items.length === 0 && (
                        <div className={styles.empty}>Ничего не найдено</div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.close} onClick={onClose}>Закрыть</button>
                </div>
            </div>
        </div>
    );
}
