import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import styles from "./LoginForm.module.css";

export function RegisterForm({
                                 onDone, onCancel,
                             }: {
    onDone: (token: string, userId: number, name: string) => void;
    onCancel: () => void;
}) {
    const [login, setLogin] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [checking, setChecking] = useState<"idle" | "checking" | "ok" | "bad">("idle");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // П
    useEffect(() => {
        if (!login.trim()) { setChecking("idle"); return; }
        const t = setTimeout(async () => {
            setChecking("checking");
            try {
                const r = await fetch(`/api/auth/check-login?login=${encodeURIComponent(login.trim())}`);
                const data = await r.json();
                setChecking(data?.available ? "ok" : "bad");
            } catch {
                setChecking("idle");
            }
        }, 400);
        return () => clearTimeout(t);
    }, [login]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null); setLoading(true);
        try {
            await api.register(login.trim().toLowerCase(), name.trim(), email.trim() || null, password);
            const r = await api.login(login.trim(), password);
            onDone(r.token, r.userId, r.name || r.login || "");
        } catch (e:any) {
            setErr(parseErr(e?.message) || "Ошибка регистрации");
        } finally {
            setLoading(false);
        }
    }


    return (
        <div className={styles.page}>
        <div className={styles.centerWrap}>
            <form onSubmit={submit} className={styles.card}>
                <div className={styles.header}>Регистрация</div>

                <label className={styles.label}>
                    Логин{" "}
                    {checking === "checking" ? "· проверяем…" :
                        checking === "ok" ? "· свободен ✅" :
                            checking === "bad" ? "· занят ❌" : ""}
                </label>
                <input
                    className={styles.input}
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="латиница/цифры/._- (3–30)"
                    autoComplete="username"
                />

                <label className={styles.label}>Имя</label>
                <input
                    className={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как к вам обращаться"
                />

                <label className={styles.label}>Email (необязательно)</label>
                <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                />

                <label className={styles.label}>Пароль</label>
                <input
                    className={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                    autoComplete="new-password"
                />

                {err && <div className={styles.error}>{err}</div>}

                <button disabled={loading} className={styles.primary} type="submit">
                    {loading ? "Создаём..." : "Создать аккаунт"}
                </button>

                <div className={styles.alt}>
                    Уже есть аккаунт?{" "}
                    <button type="button" className={styles.link} onClick={onCancel}>
                        Войти
                    </button>
                </div>
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
