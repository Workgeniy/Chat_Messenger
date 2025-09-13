// src/components/Users/SearchUsersModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { api, authFetch, type FoundUser } from "../../lib/api";
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

    // кеш результатов и отмена предыдущего запроса
    const cacheRef = useRef<Map<string, FoundUser[]>>(new Map());
    const abortRef = useRef<AbortController | null>(null);
    const lastFetchedRef = useRef<string>("");

    const MIN = 2 as const;

    type ViewState = "idle" | "loading" | "ok" | "empty" | "error";
    const state: ViewState = useMemo(() => {
        if (q.trim().length < MIN) return "idle";
        if (loading) return "loading";
        if (err) return "error";
        if (!items.length) return "empty";
        return "ok";
    }, [q, loading, err, items.length]);

    // ESC закрывает модалку
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // автофокус
    useEffect(() => { inputRef.current?.focus(); }, []);

    // фикс «прыжка» страницы: убираем скролл у body и добавляем pad-right = ширина скроллбара
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        const prevPadRight = document.body.style.paddingRight;
        const sbw = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPadRight;
        };
    }, []);

    // поиск с дебаунсом + кешем + отменой прошлых запросов
    useEffect(() => {
        setErr(null);

        const t = setTimeout(async () => {
            const query = q.trim().toLowerCase();
            if (query.length < MIN) { setLoading(false); setItems([]); return; }

            // кеш
            const cached = cacheRef.current.get(query);
            if (cached) { setItems(cached); setLoading(false); return; }

            // ту же строку уже грузили — не повторяем
            if (lastFetchedRef.current === query) { setLoading(false); return; }

            // отменяем предыдущий fetch
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;

            setLoading(true);
            const rid = ++reqIdRef.current;

            try {
                const res = await authFetch(`/users/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal } as any);
                if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

                const found = (await res.json() as FoundUser[])
                    .filter(u => u.id !== currentUserId && !excludeUserIds.includes(u.id));

                if (ctrl.signal.aborted || reqIdRef.current !== rid) return;

                cacheRef.current.set(query, found);
                lastFetchedRef.current = query;
                setItems(found);
            } catch (e: any) {
                if (ctrl.signal.aborted || reqIdRef.current !== rid) return;
                setErr(e?.message ?? "Ошибка поиска");
            } finally {
                if (reqIdRef.current === rid) setLoading(false);
            }
        }, 350);

        return () => clearTimeout(t);
    }, [q, currentUserId, excludeUserIds]);

    const toggle = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    function SkeletonRows({ count = 6 }: { count?: number }) {
        return (
            <>
                {Array.from({ length: count }).map((_, i) => (
                    <div className="skRow" key={i}>
                        <div className="skAvatar" />
                        <div className="skLines">
                            <div className="skLine skLine1" />
                            <div className="skLine skLine2" />
                        </div>
                        <div className="skBtn" />
                    </div>
                ))}
            </>
        );
    }

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

                <div className={styles.list} aria-busy={state === "loading"}>
                    {state === "idle"    && <div className={styles.hint}>Начните вводить имя/почту…</div>}
                    {state === "loading" && <SkeletonRows count={6} />}
                    {state === "error"   && (
                        <div className={styles.errorRow}>
                            <span>{err || "Ошибка поиска"}</span>
                            <button className={styles.linkBtn} onClick={() => setQ(q => q + " ")}>Повторить</button>
                        </div>
                    )}
                    {state === "empty"   && <div className={styles.empty}>Ничего не найдено</div>}
                    {state === "ok"      && items.map(u => (
                        <div className={styles.row} key={u.id}>
                            <Avatar src={u.avatarUrl} name={u.name} size={36} className={styles.avatar} title={u.name}/>
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
                </div>

                {multiSelect ? (
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
                ) : (
                    <div className={styles.footer}>
                        <button className={styles.close} onClick={onClose}>Закрыть</button>
                    </div>
                )}
            </div>
        </div>
    );
}
