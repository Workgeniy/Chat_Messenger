import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";
import { api } from "../../lib/api";

type MeDto = { id: number; name: string; email: string; avatarUrl?: string | null };
type Me = { id: number; name: string; email: string; avatarUrl?: string };

function toMe(dto: MeDto): Me {
    return { ...dto, avatarUrl: dto.avatarUrl ?? undefined };
}

export default function ProfilePanel({ onClose }: { onClose: () => void }) {
    const [me, setMe] = useState<Me | null>(null);
    const [name, setName] = useState("");

    const [savingProfile, setSavingProfile] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // email change
    const [newEmail, setNewEmail] = useState("");
    const [emailPwd, setEmailPwd] = useState("");
    const [savingEmail, setSavingEmail] = useState(false);

    // password change
    const [curPwd, setCurPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [newPwd2, setNewPwd2] = useState("");
    const [savingPwd, setSavingPwd] = useState(false);

    useEffect(() => {
        (async () => {
            const m = await api.me();
            const mm = toMe(m);
            setMe(mm);
            setName(mm.name ?? "");
            setNewEmail(mm.email ?? "");
        })();
    }, []);

    function flashOk(text: string) {
        setMsg(text);
        setErr(null);
        setTimeout(() => setMsg(null), 2500);
    }
    function flashErr(text: string) {
        setErr(text);
        setMsg(null);
        setTimeout(() => setErr(null), 3500);
    }

    async function saveProfile() {
        if (!me) return;
        setSavingProfile(true);
        try {
            await api.updateMe({ name });
            const fresh = await api.me();
            setMe(toMe(fresh));
            flashOk("Профиль сохранён");
        } catch (e: any) {
            flashErr(e?.message || "Не удалось сохранить профиль");
        } finally {
            setSavingProfile(false);
        }
    }

    async function changeAvatar(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await api.uploadAvatar(file);
            const fresh = await api.me();
            setMe(toMe(fresh));
            flashOk("Аватар обновлён");
        } catch (e: any) {
            flashErr(e?.message || "Не удалось обновить аватар");
        } finally {
            e.currentTarget.value = "";
        }
    }

    async function changeEmail() {
        if (!newEmail.trim()) {
            flashErr("Введите e-mail");
            return;
        }
        if (!emailPwd) {
            flashErr("Введите текущий пароль");
            return;
        }
        setSavingEmail(true);
        try {
            await api.changeEmail(newEmail.trim(), emailPwd);
            const fresh = toMe(await api.me());
            setMe(fresh);
            setEmailPwd("");
            flashOk("E-mail обновлён");
        } catch (e: any) {
            flashErr(e?.message || "Не удалось изменить e-mail");
        } finally {
            setSavingEmail(false);
        }
    }

    async function changePassword() {
        if (!curPwd || !newPwd) {
            flashErr("Заполните все поля");
            return;
        }
        if (newPwd.length < 6) {
            flashErr("Пароль должен быть не короче 6 символов");
            return;
        }
        if (newPwd !== newPwd2) {
            flashErr("Пароли не совпадают");
            return;
        }

        setSavingPwd(true);
        try {
            await api.changePassword(curPwd, newPwd);
            setCurPwd("");
            setNewPwd("");
            setNewPwd2("");
            flashOk("Пароль обновлён");
        } catch (e: any) {
            flashErr(e?.message || "Не удалось изменить пароль");
        } finally {
            setSavingPwd(false);
        }
    }

    return (
        <div style={backdrop}>
            <div style={card}>
                <div style={head}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Профиль</div>
                    <button onClick={onClose} style={xBtn} title="Закрыть">
                        ✖
                    </button>
                </div>

                {/* ПРОКРУЧИВАЕМАЯ ОБЛАСТЬ */}
                <div style={body}>
                    {me ? (
                        <div style={{ display: "grid", gap: 16 }}>
                            {/* alerts */}
                            {msg && (
                                <div
                                    style={{
                                        ...alert,
                                        background: "#ecfdf5",
                                        borderColor: "#86efac",
                                        color: "#065f46",
                                    }}
                                >
                                    {msg}
                                </div>
                            )}
                            {err && (
                                <div
                                    style={{
                                        ...alert,
                                        background: "#fef2f2",
                                        borderColor: "#fecaca",
                                        color: "#7f1d1d",
                                    }}
                                >
                                    {err}
                                </div>
                            )}

                            {/* avatar + name */}
                            <section style={section}>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <img
                                        src={me.avatarUrl || "https://via.placeholder.com/64"}
                                        alt=""
                                        style={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: "50%",
                                            objectFit: "cover",
                                        }}
                                    />
                                    <label style={{ cursor: "pointer", textDecoration: "underline" }}>
                                        <input type="file" hidden onChange={changeAvatar} />
                                        Сменить аватар
                                    </label>
                                </div>

                                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                    <label style={lbl}>Имя</label>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Имя"
                                        style={inp}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                        <button
                                            onClick={saveProfile}
                                            style={{ ...btn, opacity: savingProfile ? 0.7 : 1 }}
                                            disabled={savingProfile}
                                        >
                                            {savingProfile ? "Сохраняю…" : "Сохранить"}
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* change email */}
                            <section style={section}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Сменить e-mail</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                    <label style={lbl}>Новый e-mail</label>
                                    <input
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        placeholder="your@email.com"
                                        style={inp}
                                    />
                                    <label style={lbl}>Текущий пароль</label>
                                    <input
                                        type="password"
                                        value={emailPwd}
                                        onChange={(e) => setEmailPwd(e.target.value)}
                                        placeholder="Пароль"
                                        style={inp}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                        <button
                                            onClick={changeEmail}
                                            style={{ ...btn, opacity: savingEmail ? 0.7 : 1 }}
                                            disabled={savingEmail}
                                        >
                                            {savingEmail ? "Обновляю…" : "Обновить e-mail"}
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* change password */}
                            <section style={section}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Сменить пароль</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                    <label style={lbl}>Текущий пароль</label>
                                    <input
                                        type="password"
                                        value={curPwd}
                                        onChange={(e) => setCurPwd(e.target.value)}
                                        placeholder="Текущий пароль"
                                        style={inp}
                                    />
                                    <label style={lbl}>Новый пароль</label>
                                    <input
                                        type="password"
                                        value={newPwd}
                                        onChange={(e) => setNewPwd(e.target.value)}
                                        placeholder="Не короче 6 символов"
                                        style={inp}
                                    />
                                    <label style={lbl}>Подтверждение нового пароля</label>
                                    <input
                                        type="password"
                                        value={newPwd2}
                                        onChange={(e) => setNewPwd2(e.target.value)}
                                        placeholder="Повторите пароль"
                                        style={inp}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                        <button
                                            onClick={changePassword}
                                            style={{ ...btn, opacity: savingPwd ? 0.7 : 1 }}
                                            disabled={savingPwd}
                                        >
                                            {savingPwd ? "Обновляю…" : "Обновить пароль"}
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div>Загрузка…</div>
                    )}
                </div>
                {/* прокручиваемая область закрыта */}
            </div>
        </div>
    );
}

/* styles */
const backdrop: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 60,
};

const card: CSSProperties = {
    width: 520,
    maxWidth: "92vw",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 20px 80px rgba(0,0,0,.3)",
    overflow: "hidden", // чтобы скроллилась только внутренняя часть
};

const head: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flex: "0 0 auto",
};

const body: CSSProperties = {
    flex: "1 1 auto",
    overflowY: "auto",
    paddingRight: 4, // чтобы не прыгал контент из-за скроллбара
    overscrollBehavior: "contain",
};

const xBtn: CSSProperties = {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
};

const section: CSSProperties = {
    border: "1px solid #eef2f7",
    borderRadius: 12,
    padding: 12,
    background: "#fafafa",
};

const lbl: CSSProperties = { fontSize: 12, color: "#6b7280" };
const inp: CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
};
const btn: CSSProperties = {
    padding: "10px 12px",
    border: "none",
    background: "#16a34a",
    color: "#fff",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
};
const alert: CSSProperties = { border: "1px solid", padding: "8px 10px", borderRadius: 10 };
