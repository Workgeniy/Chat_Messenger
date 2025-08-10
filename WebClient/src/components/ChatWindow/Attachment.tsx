export function Attachment({ a,}: {
    a: { url?: string; contentType?: string; blobUrl?: string };
}) {
    const src = a.blobUrl ?? a.url;
    if (!src) return null;

    if (a.contentType?.startsWith("image/")) {
        return <img src={src} style={{ maxWidth: 320, borderRadius: 12 }} />;
    }
    if (a.contentType?.startsWith("video/")) {
        return <video src={src} controls style={{ maxWidth: 360, borderRadius: 12 }} />;
    }
    if (a.contentType?.startsWith("audio/")) {
        return <audio src={src} controls />;
    }
    return (
        <a href={src} target="_blank" rel="noreferrer">
            Файл
        </a>
    );
}
