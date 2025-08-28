// src/components/Profile/ChangePasswordModal.tsx
import { useState } from "react";
import { api } from "../../lib/api";
import styles from "./ProfileModals.module.css";

export default function ChangePasswordModal({
                                                onClose, onDone,
                                            }: { onClose: () => void; onDone: () => void }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        if (next.length < 6) return setErr("Новый пароль должен быть не короче 6 символов.");
        if (next !== confirm) return setErr("Пароли не совпадают.");
        setLoading(true);
        try {
            await api.changePassword(current, next);
            onDone();
            onClose();
        } catch (ex: any) {
            setErr(ex?.message || "Не удалось изменить пароль");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.backdrop} onMouseDown={onClose}>
            <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.title}>Сменить пароль</div>
                <form onSubmit={submit} className={styles.form}>
                    <label className={styles.label}>Текущий пароль</label>
                    <input className={styles.input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
                    <label className={styles.label}>Новый пароль</label>
                    <input className={styles.input} type="password" value={next} onChange={(e) => setNext(e.target.value)} />
                    <label className={styles.label}>Подтверждение пароля</label>
                    <input className={styles.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    {err && <div className={styles.error}>{err}</div>}
                    <div className={styles.actions}>
                        <button type="button" className={styles.secondary} onClick={onClose}>Отмена</button>
                        <button type="submit" className={styles.primary} disabled={loading}>Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
