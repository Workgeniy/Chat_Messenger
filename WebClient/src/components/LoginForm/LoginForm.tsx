import { useState } from "react";
import { api } from "../../lib/api";
import styles from "./LoginForm.module.css";

type Props = {
    onLogin: (token: string, userId: number, name: string) => void;
    onSwitchToRegister?: () => void;
};

export function LoginForm({ onLogin, onSwitchToRegister }: Props) {
    const [login, setLogin] = useState("");
    const [password, setPwd] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);



    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const res = await api.login(login.trim(), password);
            // имя на клиент передаём: если бек вернул name — берём его, иначе логин
            onLogin(res.token, res.userId, res.name || res.login || "");
        } catch (e: any) {
            setErr(parseErr(e?.message) || "Ошибка входа");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.centerWrap}>
                <form className={styles.card} onSubmit={submit} autoComplete="on">
                    <div className={styles.header}>Вход</div>

                    <label className={styles.label}>Логин</label>
                    <input
                        className={styles.input}
                        placeholder="Логин"
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        autoComplete="username"
                    />

                    <label className={styles.label}>Пароль</label>
                    <input
                        className={styles.input}
                        type="password"
                        placeholder="Пароль"
                        value={password}
                        onChange={(e) => setPwd(e.target.value)}
                        autoComplete="current-password"
                    />

                    {err && <div className={styles.error}>{err}</div>}

                    <button className={styles.primary} disabled={loading}>
                        {loading ? "Вход..." : "Войти"}
                    </button>

                    {onSwitchToRegister && (
                        <div className={styles.alt}>
                            Нет аккаунта?{" "}
                            <button type="button" className={styles.link} onClick={onSwitchToRegister}>
                                Создать
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}

function parseErr(s?: string) {
    if (!s) return "";
    try {
        const j = JSON.parse(s);
        return j?.detail || j?.title || s;
    } catch {
        return s;
    }
}
