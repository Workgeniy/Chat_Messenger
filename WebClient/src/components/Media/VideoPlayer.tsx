import { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = { hlsUrl?: string; src?: string; poster?: string; className?: string; };
export default function VideoPlayer({ hlsUrl, src, poster, className }: Props) {
    const ref = useRef<HTMLVideoElement|null>(null);
    const hlsRef = useRef<Hls|null>(null);

    useEffect(() => {
        const el = ref.current; if (!el) return;

        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        el.removeAttribute("src"); el.load();

        if (hlsUrl) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hlsRef.current = hls;
                hls.loadSource(hlsUrl);
                hls.attachMedia(el);
                hls.on(Hls.Events.ERROR, (_e, d) => {
                    if (d.fatal) {
                        hls.destroy(); hlsRef.current = null;
                        if (el.canPlayType("application/vnd.apple.mpegURL")) el.src = hlsUrl;
                    }
                });
            } else if (el.canPlayType("application/vnd.apple.mpegURL")) {
                el.src = hlsUrl;
            }
        } else if (src) {
            el.src = src;
        }

        return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    }, [hlsUrl, src]);

    return <video ref={ref} controls playsInline preload="metadata" poster={poster} className={className} style={{maxWidth:"100%", borderRadius:12}}/>;
}
