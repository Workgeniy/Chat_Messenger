// Attachment.tsx — обнови
type Props = { a: { id: number | string; url?: string; contentType?: string } };

export function Attachment({ a }: Props) {
    if (!a.url) return null;
    const type = a.contentType?.toLowerCase() || "";

    if (type.startsWith("image/")) {
        return (
            <a href={a.url} target="_blank" rel="noreferrer">
                <img
                    src={a.url}
                    loading="lazy"
                    alt="attachment"
                    style={{ maxWidth: 220, maxHeight: 220, objectFit: "cover", borderRadius: 8 }}
                />
            </a>
        );
    }

    if (type.startsWith("video/")) {
        return (
            <video
                controls
                preload="metadata"
                style={{ maxWidth: 360, maxHeight: 360, borderRadius: 8 }}
            >
                <source src={a.url} type={type || "video/mp4"} />
            </video>
        );
    }

    return (
        <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 8px",
                background: "#f1f5f9",
                borderRadius: 6,
                textDecoration: "none",
                color: "#111827",
                border: "1px solid #e5e7eb",
            }}
        >
            📎 {a.url.split("/").pop()}
        </a>
    );
}
