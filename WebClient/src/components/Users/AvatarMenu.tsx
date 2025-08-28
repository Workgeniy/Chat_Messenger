// src/components/Users/AvatarMenu.tsx
import { useRef, useState, useEffect } from "react";
import styles from "./AvatarMenu.module.css";

type Props = {
    name: string;
    email?: string;
    avatarUrl?: string;
    onProfile: () => void;
    onSearch: () => void;
    onNewChat: () => void;
    onLogout: () => void;
};

export default function AvatarMenu({
                                       name, email, avatarUrl, onProfile, onSearch, onNewChat, onLogout,
                                   }: Props) {
    const [open, setOpen] = useState(false);
    const [alignRight, setAlignRight] = useState(true); // right по умолчанию как у тебя
    const wrapRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // закрыть по клику вне
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (!open) return;
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    // закрыть при ресайзе/скролле окна
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, { passive: true });
        return () => {
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close);
        };
    }, [open]);

    // выбрать сторону, чтобы меню не вылезало
    useEffect(() => {
        if (!open) return;
        const w = wrapRef.current;
        const m = menuRef.current;
        if (!w || !m) return;

        // сначала показываем без стороны, чтобы получить размеры
        // (на случай первого открытия можно временно поставить right)
        const vw = window.innerWidth;
        const wb = w.getBoundingClientRect();
        const mb = m.getBoundingClientRect();

        // пробуем поставить справа: «правый край меню» совпадает с «правым краем триггера»
        const overflowLeftIfRight = wb.right - mb.width < 8;           // вылезет слева?
        const overflowRightIfLeft = wb.left + mb.width > vw - 8;       // вылезет справа?

        // логика:
        // 1) если справа не помещается (вылезет слева) — ставим left
        // 2) если слева не помещается (вылезет справа) — ставим right
        // 3) иначе оставляем right по умолчанию
        if (overflowLeftIfRight && !overflowRightIfLeft) setAlignRight(false);
        else if (overflowRightIfLeft && !overflowLeftIfRight) setAlignRight(true);
        else setAlignRight(true);
    }, [open]);

    const initial = (name?.trim()?.[0] || "U").toUpperCase();

    return (
        <div ref={wrapRef} className={styles.wrap}>
            <button type="button" className={styles.trigger} onClick={() => setOpen(v => !v)}>
                {avatarUrl ? <img src={avatarUrl} alt={name} className={styles.avatar} /> : <span className={styles.avatar}>{initial}</span>}
                <span className={styles.name}>{name}</span>
                <span className={styles.chev}>▾</span>
            </button>

            {open && (
                <div
                    ref={menuRef}
                    className={`${styles.menu} ${alignRight ? styles.right : styles.left}`}
                    // на всякий случай: фикс макс-высоты и прокрутка внутри
                    style={{ maxHeight: "70vh", overflowY: "auto" }}
                >
                    <div className={styles.me}>
                        {avatarUrl ? <img src={avatarUrl} alt={name} className={styles.meAvatar} /> : <div className={styles.meAvatar}>{initial}</div>}
                        <div className={styles.meText}>
                            <div className={styles.meName}>{name}</div>
                            {email && <div className={styles.meEmail}>{email}</div>}
                        </div>
                    </div>

                    <button className={styles.item} onClick={() => { setOpen(false); onProfile(); }}>Профиль</button>
                    <button className={styles.item} onClick={() => { setOpen(false); onSearch(); }}>Найти пользователя</button>
                    <button className={styles.item} onClick={() => { setOpen(false); onNewChat(); }}>Новая беседа</button>
                    <div className={styles.sep} />
                    <button className={`${styles.item} ${styles.danger}`} onClick={() => { setOpen(false); onLogout(); }}>Выйти</button>
                </div>
            )}
        </div>
    );
}
