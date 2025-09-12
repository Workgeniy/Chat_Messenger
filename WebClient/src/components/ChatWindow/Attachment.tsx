import { useEffect, useMemo, useState } from "react";
import {fetchAndDecryptAttachment, fetchAndDecryptThumb, getAttachmentLocalMeta} from "../../lib/api";
import VideoPlayer from "../Media/VideoPlayer.tsx";
import {makePosterFromVideoBlob} from "../../lib/media.ts";

type Att = { id: number | string; url?: string; contentType?: string; fileName?: string; sizeBytes?: number; };

export function Attachment({ a }: { a: Att }) {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [viewer, setViewer] = useState<{ open: boolean; blobUrl?: string; mime?: string }>({ open: false });

    const idNum = Number(a.id);
    const local = getAttachmentLocalMeta(idNum);

    const mime = (local?.mime || a.contentType || "").toLowerCase();
    const name = (a.fileName || "").toLowerCase();
    const looksLikeImageByExt = /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/.test(name);
    const isImage = mime.startsWith("image/") || looksLikeImageByExt;

    const id = Number(a.id);
    const ct = (a.contentType || "").toLowerCase();

    if (ct.startsWith("video/") || ct.includes("quicktime") || ct === "application/octet-stream") {
        return <VideoAttachment id={id} />;
    }

    useEffect(() => {
        let revoke: string | null = null;
        (async () => {

                      if (!isImage || !Number.isFinite(idNum)) return;
            try {
                let blob: Blob | null = null;
                try { blob = await fetchAndDecryptThumb(idNum); } catch {}
                if (!blob) blob = await fetchAndDecryptAttachment(idNum);

                           const u = URL.createObjectURL(blob);
                setThumbUrl(u); revoke = u;
            } catch {}
        })();
        return () => { if (revoke) URL.revokeObjectURL(revoke); };
    }, [idNum, isImage]);

    async function download() {
        try {
            setDownloading(true);
            const blob = await fetchAndDecryptAttachment(idNum);
            const url = URL.createObjectURL(blob);
            const aTag = document.createElement("a");
            aTag.href = url;
            aTag.download = a.fileName || `attachment_${a.id}`;
            document.body.appendChild(aTag);
            aTag.click();
            aTag.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } finally { setDownloading(false); }
    }

    async function openViewer() {
        try {
            const blob = await fetchAndDecryptAttachment(idNum);
            const url = URL.createObjectURL(blob);
            setViewer({ open: true, blobUrl: url, mime: mime || blob.type || "application/octet-stream" });
        } catch {}
    }
    function closeViewer() {
        if (viewer.blobUrl) URL.revokeObjectURL(viewer.blobUrl);
        setViewer({ open: false });
    }

    function VideoAttachment({ id }: { id: number }) {
        const [src, setSrc] = useState<string>();
        const [poster, setPoster] = useState<string>();

        useEffect(() => {
            let url: string | undefined;
            let cancelled = false;

            (async () => {
                const blob = await fetchAndDecryptAttachment(id);
                if (cancelled) return;
                url = URL.createObjectURL(blob);
                setSrc(url);
                const p = await makePosterFromVideoBlob(blob);
                if (!cancelled && p) setPoster(p);
            })();

            return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
        }, [id]);

        if (!src) return <div style={{width:240, height:135, background:"#eee", borderRadius:10}} />;

        return <VideoPlayer src={src} poster={poster} />;
    }



    const prettySize = useMemo(() => {
        const s = a.sizeBytes ?? 0; if (!s) return "";
        const u = ["B","KB","MB","GB"]; let n=s,i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;}
        return `${n.toFixed(i===0?0:1)} ${u[i]}`;
    }, [a.sizeBytes]);

    return (
        <>
            <div
                onClick={(e) => { e.stopPropagation(); void openViewer(); }}
                onMouseDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{
                    display:"flex", gap:10, alignItems:"center",
                    padding:8, borderRadius:10, background:"rgba(0,0,0,0.06)",
                    cursor:"pointer", minWidth:180, maxWidth:320
                }}
                title="Открыть"
                role="button"
            >
                <div style={{
                    width:64, height:64, borderRadius:8, overflow:"hidden",
                    background:"#f3f3f3", display:"grid", placeItems:"center", flex:"0 0 auto"
                }}>
                    {isImage && thumbUrl ? (
                        <img
                            src={thumbUrl}
                            alt=""
                            draggable={false}
                            onMouseDown={(e) => e.stopPropagation()}
                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            style={{ width:"100%", height:"100%", objectFit:"cover" }}
                        />
                    ) : (
                        <div style={{ fontSize:28 }}>📎</div>
                    )}
                </div>

                <div style={{ display:"grid", gap:4, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, whiteSpace:"nowrap", textOverflow:"ellipsis", overflow:"hidden", maxWidth:200 }}>
                        {a.fileName || `attachment_${a.id}`}
                    </div>
                    <div style={{ fontSize:12, opacity:.7 }}>
                        {(mime || (a.contentType||"")).split(";")[0]} {prettySize && `• ${prettySize}`}
                    </div>
                    <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e)=>{ e.stopPropagation(); void download(); }}
                        disabled={downloading}
                        style={{
                            marginTop:4, width:"fit-content", padding:"4px 8px",
                            borderRadius:6, border:"1px solid rgba(0,0,0,0.15)",
                            background:"#fff", fontSize:12, cursor:"pointer"
                        }}
                    >
                        {downloading ? "…" : "Скачать"}
                    </button>
                </div>
            </div>

            {viewer.open && (
                <div
                    onClick={closeViewer}
                    style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"grid", placeItems:"center", zIndex:1000 }}
                >
                    <div
                        onClick={(e)=>e.stopPropagation()}
                        style={{ maxWidth:"90vw", maxHeight:"90vh", background:"#111", borderRadius:12, padding:12, display:"grid", placeItems:"center" }}
                    >
                        {viewer.mime?.startsWith("image/") ? (
                            <img src={viewer.blobUrl} alt="" style={{ maxWidth:"88vw", maxHeight:"82vh", objectFit:"contain", borderRadius:8 }} />
                        ) : viewer.mime?.startsWith("video/") ? (
                            <video src={viewer.blobUrl} controls style={{ maxWidth:"88vw", maxHeight:"82vh" }} />
                        ) : viewer.mime?.startsWith("audio/") ? (
                            <audio src={viewer.blobUrl} controls style={{ width:"70vw" }} />
                        ) : (
                            <div style={{ color:"#fff" }}>
                                Предпросмотр не поддерживается.
                                <div style={{ marginTop:8 }}>
                                    <a href={viewer.blobUrl} download={a.fileName || `attachment_${a.id}`} style={{ color:"#9cf" }}>
                                        Скачать файл
                                    </a>
                                </div>
                            </div>
                        )}
                        <button onClick={closeViewer} style={{ marginTop:12, padding:"6px 12px", borderRadius:8, background:"#fff", border:"none", cursor:"pointer" }}>
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
