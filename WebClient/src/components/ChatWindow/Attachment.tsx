import styles from "./Attachment.module.css";
import { useEffect, useState } from "react";
import {authFetch, fetchAndDecryptAttachment} from "../../lib/api";

type A = {
    id: number | string;
    url?: string;
    thumbUrl?: string;
    contentType?: string;
    fileName?: string;
    sizeBytes?: number;
};

export function humanSize(bytes?: number) {
    if (bytes === undefined || bytes === null) return "";
    const u = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let i = 0; let n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function Attachment({ a }: { a: A }) {
    const [thumbUrl] = useState<string | null>(null);
    const [isEncrypted] = useState(false);
    const [plainPreviewUrl, setPlainPreviewUrl] = useState<string | null>(null);
    const isImage = (a.contentType || "").startsWith("image/");
    const isVideo = (a.contentType || "").startsWith("video/");
    const name = a.fileName || `file_${a.id}`;
    const size = humanSize(a.sizeBytes);

    // Пытаемся подгрузить расшифрованную миниатюру (если это шифрованная картинка)
    useEffect(() => {
        let u: string | null = null;
        (async () => {
            if (!isImage || isEncrypted) return;
            const idNum = Number(a.id);
            if (!Number.isFinite(idNum)) return;
            try {
                const res = await authFetch(`${API}/attachments/${idNum}`);
                if (!res.ok) return;
                const blob = await res.blob();
                u = URL.createObjectURL(blob);
                setPlainPreviewUrl(u);
            } catch {/* ignore */}
        })();
        return () => { if (u) URL.revokeObjectURL(u); };
    }, [a.id, isImage, isEncrypted]);

    async function onDownload() {
        try {
            const blob = await fetchAndDecryptAttachment(Number(a.id));
            const u = URL.createObjectURL(blob);
            const aTag = document.createElement("a");
            aTag.href = u;
            aTag.download = name || "file";
            document.body.appendChild(aTag);
            aTag.click();
            aTag.remove();
            setTimeout(() => URL.revokeObjectURL(u), 1500);
        } catch {
            // fallback: если незашифровано — просто открыть ссылку
            if (a.url) window.open(a.url, "_blank");
        }
    }

    async function onOpen() {
        try {
            const blob = await fetchAndDecryptAttachment(Number(a.id));
            const u = URL.createObjectURL(blob);
            window.open(u, "_blank");
            setTimeout(() => URL.revokeObjectURL(u), 60_000);
        } catch {
            if (a.url) window.open(a.url, "_blank");
        }
    }


    return (
        <div className={styles.card}>
            <div className={styles.previewBox}>
                {/* PREVIEW */}
                {isImage ? (
                    isEncrypted && thumbUrl ? (
                        <img src={thumbUrl} alt={name} className={styles.thumb} />
                    ) : plainPreviewUrl ? (
                        <img src={plainPreviewUrl} alt={name} className={styles.thumb} />
                    ) : (
                        <div className={styles.fileIcon}>🖼️</div>
                    )
                ) : isVideo ? (
                    // Для шифрованного видео стрим-расшифровка не делается в MVP — предлагаем скачать/открыть.
                    a.url && !isEncrypted ? (
                        <video className={styles.video} src={a.url} poster={a.thumbUrl || undefined} controls />
                    ) : (
                        <div className={styles.fileIcon}>🎬</div>
                    )
                ) : (
                    <div className={styles.fileIcon}>📄</div>
                )}

                {/* ACTIONS */}
                {isEncrypted ? (
                    <div className={styles.actions}>
                        <button className={styles.downloadBtn} title="Открыть" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                            👁
                        </button>
                        <button className={styles.downloadBtn} title="Скачать" onClick={(e) => { e.stopPropagation(); onDownload(); }}>
                            ⬇
                        </button>
                    </div>
                ) : a.url ? (
                    <a
                        className={styles.downloadBtn}
                        href={a.url}
                        download
                        title="Скачать"
                        onClick={(e) => e.stopPropagation()}
                    >
                        ⬇
                    </a>
                ) : null}
            </div>

            <div className={styles.meta}>
                <div className={styles.name} title={name}>{name}</div>
                <div className={styles.sub}>
                    {(a.contentType || "файл")}{size ? ` · ${size}` : ""}
                    {isEncrypted ? " · 🔒" : ""}
                </div>
            </div>
        </div>
    );
}

export default Attachment;
