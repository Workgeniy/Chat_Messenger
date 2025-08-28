// src/components/Profile/ChangeEmailModal.tsx
import { useState } from "react";
import { api } from "../../lib/api";
import styles from "./ProfileModals.module.css";

export default function ChangeEmailModal({
                                             currentEmail,
                                             onClose,
                                             onDone,
                                         }: { currentEmail?: string; onClose: () => void; onDone: (newEmail: string) => void }) {
    const [email, setEmail] = useState(currentEmail ?? "");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        if (!email.trim()) return setErr("Введите e-mail.");
        setLoading(true);
        try {
            await api.changeEmail(email.trim(), password);
            onDone(email.trim());
            onClose();
        } catch (ex: any) {
            setErr(ex?.message || "Не удалось изменить e-mail");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.backdrop} onMouseDown={onClose}>
            <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
                <div className={styles.title}>Сменить e-mail</div>
                <form onSubmit={submit} className={styles.form}>
                    <label className={styles.label}>Новый e-mail</label>
                    <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                    <label className={styles.label}>Пароль (для подтверждения)</label>
                    <input className={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
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
