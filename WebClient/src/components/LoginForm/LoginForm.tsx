import { useState } from "react";
import { api } from "../../lib/api";

type Props = {
    onLogin: (token: string, userId: number, name: string) => void;
};

export function LoginForm({ onLogin }: Props) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const r = await api.login(email, password);
            onLogin(r.token, r.userId, r.displayName);
        } catch (e: any) {
            setErr(e.message || "Ошибка входа");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{display:"grid",placeItems:"center",height:"100vh",background:"#f5f6f8"}}>
            <form onSubmit={submit} style={{background:"#fff",padding:24,borderRadius:12,boxShadow:"0 6px 20px rgba(0,0,0,.08)",width:320,display:"grid",gap:12}}>
                <div style={{fontWeight:600,fontSize:18}}>Вход</div>
                <input
                    placeholder="Email"
                    value={email}
                    onChange={(e)=>setEmail(e.target.value)}
                    style={{padding:"10px 12px",border:"1px solid #d6dbe1",borderRadius:10}}
                />
                <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={(e)=>setPassword(e.target.value)}
                    style={{padding:"10px 12px",border:"1px solid #d6dbe1",borderRadius:10}}
                />
                {err && <div style={{color:"#e11d48",fontSize:13}}>{err}</div>}
                <button disabled={loading} style={{padding:"10px 12px",borderRadius:10,border:"none",background:"#4473ff",color:"#fff",cursor:"pointer"}}>
                    {loading ? "..." : "Войти"}
                </button>
            </form>
        </div>
    );
}
