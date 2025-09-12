// imports сверху
import { fetchAndDecryptAttachment, fetchAndDecryptThumb } from "../../lib/api";
import { makePosterFromVideoBlob } from "../../lib/media";
import VideoPlayer from "../Media/VideoPlayer";
import {useEffect, useState} from "react"; // ваш плеер

type Att = { id: number | string; url?: string; contentType?: string };

export function Attachment({ a }: { a: Att }) {
    const id = Number(a.id);
    const [url, setUrl] = useState<string | null>(null);
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [poster, setPoster] = useState<string | undefined>(undefined);
    const mime = a.contentType || "";

    // 1) миниатюра для изображений (и как fallback для видео)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                // сначала пробуем серверный thumb; если 404 — загрузим контент и сами сделаем постер
                const blob = await fetchAndDecryptThumb(id).catch(async () => null as any);
                if (!alive) return;
                if (blob) {
                    const u = URL.createObjectURL(blob);
                    setThumbUrl(u);
                }
            } catch {/* no-op */}
        })();
        return () => {
            alive = false;
            setThumbUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
        };
    }, [id]);

    // 2) сам контент (для img/audio/video/file)
    useEffect(() => {
        let alive = true;
        (async () => {
            const blob = await fetchAndDecryptAttachment(id);
            if (!alive) return;
            const u = URL.createObjectURL(blob);
            setUrl(u);

            // постер для видео — один раз, из того же blob
            if (mime.startsWith("video/") && !poster) {
                makePosterFromVideoBlob(blob).then((p) => { if (p && alive) setPoster(p); });
            }
        })();
        return () => {
            alive = false;
            setUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
        };
    }, [id, mime]); // <— не зависим от url/постера, чтобы не гонять по кругу

    if (mime.startsWith("image/")) {
        // показываем thumb, а по клику можно открыть url (полный)
        return (
            <a href={url ?? undefined} target="_blank" rel="noreferrer" onClick={(e)=>!url && e.preventDefault()}>
                <img src={thumbUrl ?? url ?? ""} alt="" style={{maxWidth: 320, borderRadius: 12}}/>
            </a>
        );
    }

    if (mime.startsWith("video/")) {
        return (
            <div style={{maxWidth: 420}}>
                <VideoPlayer src={url ?? undefined} poster={poster ?? thumbUrl ?? undefined} />
            </div>
        );
    }

    if (mime.startsWith("audio/")) {
        return <audio src={url ?? undefined} controls style={{maxWidth: 360}}/>;
    }

    // generic файл
    return (
        <a href={url ?? undefined} download style={{display:"inline-flex",alignItems:"center",gap:8}}>
            📄 attachment_{id}
        </a>
    );
}
