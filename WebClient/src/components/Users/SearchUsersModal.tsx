
import { useEffect, useRef, useState } from "react";
import { api, type FoundUser } from "../../lib/api";
import styles from "./SearchUsersModal.module.css";
import Avatar from "../common/Avatar.tsx";


type Props = {
    currentUserId: number;
    onClose: () => void;
    onPick?: (chatId: number) => void | Promise<void>;
    onPickUsers?: (ids: number[]) => void | Promise<void>;
    multiSelect?: boolean;
    excludeUserIds?: number[];
};


export default function SearchUsersModal(props: Props) {
    const { currentUserId, onClose, onPick, onPickUsers, multiSelect, excludeUserIds = [] } = props;

    const [q, setQ] = useState("");
    const [items, setItems] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const reqIdRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const [selected, setSelected] = useState<Set<number>>(new Set());

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
                setItems(found.filter(u => u.id !== currentUserId && !excludeUserIds.includes(u.id)));
            } catch (e: any) {
                if (reqIdRef.current !== rid) return;
                setErr(e?.message ?? "Ошибка поиска");
            } finally {
                if (reqIdRef.current === rid) setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [q, currentUserId, excludeUserIds]);

    const toggle = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    return (
        <div className={styles.backdrop} onMouseDown={onClose}>
            <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
                <input
                    ref={inputRef}
                    className={styles.input}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Введите минимум 2 символа"
                />
                {err && <div className={styles.error}>{err}</div>}

                <div className={styles.list}>
                    {q.trim().length < 2 && <div className={styles.row}>Начните вводить имя/почту…</div>}
                    {q.trim().length >= 2 && loading && <div className={styles.row}>Ищем…</div>}
                    {q.trim().length >= 2 && !loading && !err && items.length === 0 && (
                        <div className={styles.empty}>Ничего не найдено</div>
                    )}

                    {items.map(u => (
                        <div className={styles.row} key={u.id}>
                            <Avatar
                                src={u.avatarUrl}
                                name={u.name}
                                size={36}
                                className={styles.avatar}
                                title={u.name}
                            />
                            <div className={styles.meta}>
                                <div className={styles.name}>{u.name}</div>
                                <div className={styles.email}>{u.email}</div>
                            </div>

                            {multiSelect ? (
                                <button
                                    className={styles.primary}
                                    onClick={() => toggle(u.id)}
                                    aria-pressed={selected.has(u.id)}
                                >
                                    {selected.has(u.id) ? "✓ Выбран" : "＋ Выбрать"}
                                </button>
                            ) : (
                                <button
                                    className={styles.primary}
                                    onClick={async () => {
                                        const chat = await api.startChatWith(u.id);
                                        await onPick?.(chat.id);
                                        onClose();
                                    }}
                                >
                                    Написать
                                </button>
                            )}
                        </div>
                    ))}

                {multiSelect && (
                    <div className={styles.footerRow}>
                        <button className={styles.secondary} onClick={onClose}>Отмена</button>
                        <button
                            className={styles.primary}
                            disabled={selected.size === 0}
                            onClick={async () => {
                                await onPickUsers?.([...selected]);
                                onClose();
                            }}
                        >
                            Добавить ({selected.size})
                        </button>
                    </div>
                )}

                {!multiSelect && (
                    <div className={styles.footer}><button className={styles.close} onClick={onClose}>Закрыть</button></div>
                )}
            </div>
        </div>
        </div>
    );
}
