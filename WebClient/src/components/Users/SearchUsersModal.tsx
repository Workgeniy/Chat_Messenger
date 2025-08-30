// src/components/Users/SearchUsersModal.tsx
import { useEffect, useRef, useState } from "react";
import { api, type FoundUser } from "../../lib/api";
import styles from "./SearchUsersModal.module.css";

type Props = { onClose: () => void; onPick: (chatId: number) => void; currentUserId: number };

export default function SearchUsersModal({ onClose, onPick, currentUserId }: Props) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const reqIdRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
    useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose]);
    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        setErr(null);
        const t = setTimeout(async () => {
            const query = q.trim();
            if (query.length < 2) { setItems([]); setLoading(false); return; }

            const rid = ++reqIdRef.current;
            try {
                setLoading(true);
                const found = await api.searchUsers(query);
                if (reqIdRef.current !== rid) return;
                setItems(found.filter(u => u.id !== currentUserId));
            } catch (e: any) {
                if (reqIdRef.current !== rid) return;
                setErr(e?.message ?? "Ошибка поиска");
            } finally {
                if (reqIdRef.current === rid) setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [q, currentUserId]);

    const fallback = (name?: string) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || "U")}`;

    async function writeTo(userId: number) {
        const chat = await api.startChatWith(userId);
        onPick(chat.id);
    }

    return (
        <div className={styles.backdrop} onMouseDown={onClose}>
            <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
                <input ref={inputRef} className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Введите минимум 2 символа" />
                {err && <div className={styles.error}>{err}</div>}

                <div className={styles.list}>
                    {q.trim().length < 2 && <div className={styles.row}>Начните вводить имя/почту…</div>}
                    {q.trim().length >= 2 && loading && <div className={styles.row}>Ищем…</div>}

                    {q.trim().length >= 2 && !loading && !err && items.length === 0 && (
                        <div className={styles.empty}>Ничего не найдено</div>
                    )}

                    {items.map(u => (
                        <div className={styles.row} key={u.id}>
                            <img className={styles.avatar} src={u.avatarUrl || fallback(u.name)} onError={(e) => { const fb = fallback(u.name); if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }} alt="" />
                            <div className={styles.meta}>
                                <div className={styles.name}>{u.name}</div>
                                <div className={styles.email}>{u.email}</div>
                            </div>
                            <button className={styles.primary} onClick={() => void writeTo(u.id)}>Написать</button>
                        </div>
                    ))}
                </div>

                <div className={styles.footer}><button className={styles.close} onClick={onClose}>Закрыть</button></div>
            </div>
        </div>
    );
}
