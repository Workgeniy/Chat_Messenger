import { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = {
    hlsUrl?: string;
    src?: string;
    poster?: string;
    className?: string;
};

export default function VideoPlayer({ hlsUrl, src, poster, className }: Props) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!ref.current) return;

        if (hlsUrl && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(hlsUrl);
            hls.attachMedia(ref.current);
            return () => hls.destroy();
        } else if (hlsUrl) {
            // Safari: умеет HLS нативно
            ref.current.src = hlsUrl;
        } else if (src) {
            ref.current.src = src;
        }
    }, [hlsUrl, src]);

    return (
        <video
            ref={ref}
            controls
            playsInline
            poster={poster}
            className={className}
            style={{ maxWidth: 380, borderRadius: 12 }}
        />
    );
}
