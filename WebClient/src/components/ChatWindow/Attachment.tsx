type Props = {
    a: { id: number | string; url?: string; contentType?: string };
};

function toFullUrl(u?: string) {
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    return u.startsWith("/") ? u : `/${u}`;
}

export function Attachment({ a }: Props) {
    if (!a.url) return null;
    const url = toFullUrl(a.url);
    const type = a.contentType || "";

    if (type.startsWith("image/")) {
        return (
            <a href={url} target="_blank" rel="noreferrer">
                <img
                    src={url}
                    alt="attachment"
                    style={{ maxWidth: 200, maxHeight: 200, objectFit: "cover", borderRadius: 8 }}
                />
            </a>
        );
    }

    if (type.startsWith("video/")) {
        return (
            <video controls preload="metadata" src={url} style={{ maxWidth: 320, maxHeight: 320, borderRadius: 8 }}>
                Ваш браузер не поддерживает видео.
            </video>
        );
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", background: "#f1f1f1", borderRadius: 6 }}
        >
            📎 {url.split("/").pop()}
        </a>
    );
}
