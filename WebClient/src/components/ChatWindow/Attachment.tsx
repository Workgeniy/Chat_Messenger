import styles from "./Attachment.module.css";

type A = {
    id: number | string;
    url?: string;
    thumbUrl?: string;
    contentType?: string;
    fileName?: string;
    sizeBytes?: number;
};

export function humanSize(bytes?: number) {
    if (!bytes && bytes !== 0) return "";
    const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function Attachment({ a }: { a: A }) {
    const isImage = (a.contentType || "").startsWith("image/");
    const isVideo = (a.contentType || "").startsWith("video/");

    const name = a.fileName || `file_${a.id}`;
    const size = humanSize(a.sizeBytes);

    return (
        <div className={styles.card}>
            <div className={styles.previewBox}>
                {isImage ? (
                    <img
                        src={a.url || a.thumbUrl}
                        alt={name}
                        className={styles.thumb}
                    />
                ) : isVideo ? (
                    <video
                        className={styles.video}
                        src={a.url}
                        poster={a.thumbUrl || undefined}
                        controls
                    />
                ) : (
                    <div className={styles.fileIcon}>📄</div>
                )}

                {a.url && (
                    <a
                        className={styles.downloadBtn}
                        href={a.url}
                        download
                        title="Скачать"
                        onClick={(e) => e.stopPropagation()}
                    >
                        ⬇
                    </a>
                )}
            </div>

            <div className={styles.meta}>
                <div className={styles.name} title={name}>{name}</div>
                <div className={styles.sub}>
                    {a.contentType || "файл"}{size ? ` · ${size}` : ""}
                </div>
            </div>
        </div>
    );
}

export default Attachment;
