// src/components/Chats/CreateChatModal.tsx
import { useEffect, useState } from "react";
import { api, type FoundUser, type Chat } from "../../lib/api";
import styles from "./CreateChatModal.module.css";

type PersonRow = { id: number; name: string; email?: string; avatarUrl?: string };

export default function CreateChatModal({
                                            currentUserId,
                                            onClose,
                                            onCreated,
                                        }: {
    currentUserId: number;
    onClose: () => void;
    onCreated: (chatId: number) => void;
}) {
    // --- поиск / контакты ---
    const [q, setQ] = useState("");
    const [searchItems, ] = useState<FoundUser[]>([]);
    const [contacts, setContacts] = useState<PersonRow[]>([]);
    const [loading, setLoading] = useState(false);

    // --- создание беседы ---
    const [name, setName] = useState("");
    const [picked, setPicked] = useState<number[]>([]);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [, setItems] = useState<FoundUser[]>([]);
    const [, setErr] = useState<string|null>(null);

    // подтягиваем «мои контакты» (DM-шки)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const list: Chat[] = await api.myChats();
                const map = new Map<number, PersonRow>();
                for (const c of list) {
                    if (!c.isGroup && c.opponentId && c.opponentId !== currentUserId) {
                        map.set(c.opponentId, {
                            id: c.opponentId,
                            name: c.title,
                            avatarUrl: c.avatarUrl,
                        });
                    }
                }
                if (!cancelled) setContacts([...map.values()]);
            } catch { /* no-op */ }
        })();
        return () => { cancelled = true; };
    }, [currentUserId]);

    // поиск пользователей — только при вводе (>=2 символов)
    useEffect(() => {
        setErr(null);
        const t = setTimeout(async () => {
            const query = q.trim();
            if (!query) { setItems([]); setLoading(false); return; }   // ← пусто без ввода
            setLoading(true);
            try {
                const found = await api.searchUsers(query);
                setItems(found.filter(u => u.id !== currentUserId));
            } catch (e:any) {
                setErr(e?.message ?? "Ошибка поиска");
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [q, currentUserId]);

    function toggle(id: number) {
        setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }

    function onPickAvatar(file: File | null) {
        setAvatarFile(file);
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(file ? URL.createObjectURL(file) : null);
    }
    useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

    async function submit() {
        if (!name.trim() || picked.length < 2) return; // для группы нужно >=2 участника
        setBusy(true);
        try {
            let avatarUrl: string | undefined;
            if (avatarFile) {
                const up = await api.upload(avatarFile);
                avatarUrl = up.url ?? `/attachments/${up.id}`;
            }
            const chat = await api.createChat(name.trim(), picked, avatarUrl);
            onCreated(chat.id);
        } catch (e: any) {
            alert(e?.message || "Не удалось создать беседу");
        } finally {
            setBusy(false);
        }
    }

    const fallback = (n?: string) =>
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(n || "U")}`;

    const showContacts = q.trim().length < 2;

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.card} onClick={e => e.stopPropagation()}>
                <div className={styles.title}>Новая беседа</div>

                <label className={styles.field}>
                    <span>Название</span>
                    <input
                        className={styles.input}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Например: Проект А"
                    />
                </label>

                <label className={styles.field}>
                    <span>Аватар (опционально)</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <label className={styles.avatarPick}>
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                            ) : (
                                <div className={styles.avatarPlaceholder}>Выбрать…</div>
                            )}
                            <input type="file" accept="image/*" hidden onChange={e => onPickAvatar(e.target.files?.[0] ?? null)} />
                        </label>
                        {avatarPreview && (
                            <button className={styles.secondary} onClick={() => onPickAvatar(null)}>Сбросить</button>
                        )}
                    </div>
                </label>

                <div className={styles.sep} />

                <input
                    className={styles.input}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Поиск участников (минимум 2 символа)…"
                />

                <div className={styles.list}>
                    {showContacts ? (
                        <>
                            {contacts.length === 0 && <div className={styles.row}>У вас пока нет контактов</div>}
                            {contacts.map(u => (
                                <label key={u.id} className={styles.row}>
                                    <input
                                        type="checkbox"
                                        checked={picked.includes(u.id)}
                                        onChange={() => toggle(u.id)}
                                    />
                                    <img className={styles.avatar} src={u.avatarUrl || fallback(u.name)} alt="" />
                                    <div className={styles.meta}>
                                        <div className={styles.name}>{u.name}</div>
                                        {u.email ? <div className={styles.email}>{u.email}</div> : null}
                                    </div>
                                </label>
                            ))}
                        </>
                    ) : (
                        <>
                            {loading && <div className={styles.row}>Поиск…</div>}
                            {!loading && searchItems.length === 0 && (
                                <div className={styles.row}>Никого не нашли</div>
                            )}
                            {searchItems.map(u => (
                                <label key={u.id} className={styles.row}>
                                    <input
                                        type="checkbox"
                                        checked={picked.includes(u.id)}
                                        onChange={() => toggle(u.id)}
                                    />
                                    <img className={styles.avatar} src={u.avatarUrl || fallback(u.name)} alt="" />
                                    <div className={styles.meta}>
                                        <div className={styles.name}>{u.name}</div>
                                        <div className={styles.email}>{u.email}</div>
                                    </div>
                                </label>
                            ))}
                        </>
                    )}
                </div>

                <div className={styles.actions}>
                    <button className={styles.secondary} onClick={onClose}>Отмена</button>
                    <button
                        className={styles.primary}
                        disabled={busy || !name.trim() || picked.length < 2}
                        onClick={submit}
                        title={picked.length < 2 ? "Выберите минимум двух участников" : ""}
                    >
                        Создать
                    </button>
                </div>
            </div>
        </div>
    );
}
