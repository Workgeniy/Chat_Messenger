type Props = {
    a: { id: number | string; url?: string; contentType?: string };
};

export function Attachment({ a }: Props) {
    if (!a.url) return null;

    const type = a.contentType || '';

    // Если картинка
    if (type.startsWith('image/')) {
        return (
            <a href={a.url} target="_blank" rel="noreferrer">
                <img
                    src={a.url}
                    alt="attachment"
                    style={{
                        maxWidth: 200,
                        maxHeight: 200,
                        objectFit: 'cover',
                        borderRadius: 8
                    }}
                />
            </a>
        );
    }

    // Если видео
    if (type.startsWith('video/')) {
        return (
            <video
                controls
                style={{
                    maxWidth: 300,
                    maxHeight: 300,
                    borderRadius: 8
                }}
            >
                <source src={a.url} type={type} />
                Ваш браузер не поддерживает видео.
            </video>
        );
    }

    // Если любой другой файл
    return (
        <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: '#f1f1f1',
                borderRadius: 6,
                textDecoration: 'none',
                color: '#333'
            }}
        >
            📎 {a.url.split('/').pop()}
        </a>
    );
}
