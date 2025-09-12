export async function makePosterFromVideoBlob(blob: Blob): Promise<string | undefined> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const v = document.createElement("video");
        v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;

        const cleanup = () => URL.revokeObjectURL(url);

        v.onloadeddata = async () => {
            try {
                const t = Math.min(0.5, (v.duration || 5) / 10);
                if (!isNaN(t)) v.currentTime = t;
                await new Promise(r => (v.onseeked = () => r(null)));

                const c = document.createElement("canvas");
                c.width = Math.max(1, v.videoWidth);
                c.height = Math.max(1, v.videoHeight);
                c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
                const dataUrl = c.toDataURL("image/jpeg", 0.85);
                cleanup(); resolve(dataUrl);
            } catch { cleanup(); resolve(undefined); }
        };
        v.onerror = () => { cleanup(); resolve(undefined); };
    });
}
