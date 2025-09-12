import Hls from "hls.js";
import { useEffect, useRef } from "react";

type Props = { hlsUrl?: string; src?: string; poster?: string; className?: string };

export default function VideoPlayer({ hlsUrl, src, poster, className }: Props) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // HLS
        if (hlsUrl) {
            if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(hlsUrl);
                hls.attachMedia(el);
                return () => hls.destroy();
            } else {
                el.src = hlsUrl;     // Safari
                return () => { el.removeAttribute("src"); el.load(); };
            }
        }

        // обычный blob/mp4
        if (src) {
            el.src = src;
            return () => { el.removeAttribute("src"); el.load(); };
        }
    }, [hlsUrl, src]);

    return (
        <video
            ref={ref}
            controls
            playsInline
            preload="metadata"
            poster={poster}
            className={className}
            style={{ maxWidth: 420, borderRadius: 12 }}
        />
    );
}
