import { useEffect, useState } from "react";
import { api, type FoundUser } from "../../lib/api";
import styles from "./CreateChatModal.module.css";

export default function CreateChatModal({
                                            currentUserId,
                                            onClose,
                                            onCreated,              // (chatId:number) => void
                                        }: {
    currentUserId: number;
    onClose: () => void;
    onCreated: (chatId: number) => void;
}) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState<FoundUser[]>([]);
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState("");
    const [picked, setPicked] = useState<number[]>([]);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let aborted = false;
        (async () => {
            setLoading(true);
            try {
                const found = await api.searchUsers(q);
                const filtered = found.filter(u => u.id !== currentUserId);
                if (!aborted) setItems(filtered);
            } finally {
                if (!aborted) setLoading(false);
            }
        })();
        return () => { aborted = true; };
    }, [q, currentUserId]);

    function toggle(id: number) {
        setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }

    async function submit() {
        if (!name.trim() || picked.length < 2) return;   // беседа >1 участника
        setBusy(true);
        try {
            let avatarUrl: string | undefined;
            if (avatarFile) {
                // можно через общий аплоад вложений
                const form = new FormData();
                form.append("file", avatarFile);
                const up = await fetch(`${import.meta.env.VITE_API_BASE || "/api"}/attachments`, {
                    method: "POST",
                    headers: {}, // токен подставится в http() — но тут прямой fetch, можно без токена если сервер не требует для вложений
                    body: form
                });
                if (up.ok) {
                    const data = await up.json() as { id:number; url?:string };
                    avatarUrl = data.url;
                }
            }

            const chat = await api.createChat(name.trim(), picked, avatarUrl);
            onCreated(chat.id);
        } catch (e:any) {
            alert(e?.message || "Не удалось создать беседу");
        } finally {
            setBusy(false);
        }
    }

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
                    <input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
                </label>

                <div className={styles.sep} />

                <input
                    className={styles.input}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Поиск участников..."
                />

                <div className={styles.list}>
                    {loading && <div className={styles.row}>Поиск…</div>}
                    {items.map(u => (
                        <label key={u.id} className={styles.row}>
                            <input
                                type="checkbox"
                                checked={picked.includes(u.id)}
                                onChange={() => toggle(u.id)}
                            />
                            <img
                                className={styles.avatar}
                                src={u.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`}
                                alt=""
                            />
                            <div className={styles.meta}>
                                <div className={styles.name}>{u.name}</div>
                                <div className={styles.email}>{u.email}</div>
                            </div>
                        </label>
                    ))}
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
