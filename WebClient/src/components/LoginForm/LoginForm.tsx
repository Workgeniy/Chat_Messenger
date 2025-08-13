import { useState } from "react";
import { api } from "../../lib/api";
import styles from "./LoginForm.module.css";

type Props = {
    onLogin: (token: string, userId: number, name: string) => void;
    onSwitchToRegister?: () => void;
};

export function LoginForm({ onLogin, onSwitchToRegister }: Props) {
    const [email, setEmail] = useState("");
    const [password, setPwd] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();                  // ВАЖНО: не даём форме перезагружать страницу
        setErr(null);
        setLoading(true);
        try {
            const { token, userId, displayName } = await api.login(email.trim(), password);
            onLogin(token, userId, displayName);  // передаём наверх — App сохранит в storage
        } catch (e: any) {
            console.error("login failed", e);
            setErr(e?.message || "Ошибка входа");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form className={styles.card} onSubmit={submit} autoComplete="on">
            <div className={styles.title}>Вход</div>
            <input
                className={styles.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
            <input
                className={styles.input}
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPwd(e.target.value)}
            />
            {err && <div className={styles.error}>{err}</div>}
            <button className={styles.primary} disabled={loading}>
                {loading ? "Вход..." : "Войти"}
            </button>

            {onSwitchToRegister && (
                <button
                    type="button"
                    className={styles.link}
                    onClick={onSwitchToRegister}
                    style={{ marginTop: 8 }}
                >
                    Создать
                </button>
            )}
        </form>
    );
}
