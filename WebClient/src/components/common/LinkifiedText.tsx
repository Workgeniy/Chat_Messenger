import React from "react";

const urlRe = /((https?:\/\/|www\.)[^\s<]+[^<.,:;"')\]\s])/gi;

export default function LinkifiedText({ text }: { text?: string | null }) {
    if (!text) return null;
    const parts: React.ReactNode[] = [];
    let last = 0, m: RegExpExecArray | null;

    while ((m = urlRe.exec(text))) {
        const start = m.index;
        if (start > last) parts.push(<span key={parts.length}>{text.slice(last, start)}</span>);
        const raw = m[0];
        const href = raw.startsWith("http") ? raw : `http://${raw}`;
        parts.push(
            <a key={parts.length} href={href} target="_blank" rel="noopener noreferrer">
                {raw}
            </a>
        );
        last = urlRe.lastIndex;
    }
    if (last < text.length) parts.push(<span key={parts.length}>{text.slice(last)}</span>);
    return <>{parts}</>;
}
