// src/components/common/Avatar.tsx
import SecureImg from "../common/SecureImg";
import { toSafeImgUrl } from "../../lib/url";

type Props = {
    src?: string | null;
    name?: string | null;
    size?: number;              // px
    className?: string;
    title?: string;
};

function initials(name?: string | null) {
    const n = (name || "").trim();
    if (!n) return "U";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]).join("").toUpperCase();
}

function colorFrom(name?: string | null) {
    const s = (name || "U");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 70% 55%)`;
}

export default function Avatar({ src, name, size = 36, className, title }: Props) {
    const safe = toSafeImgUrl(src || undefined); // может вернуть undefined
    if (safe) {
        return (
            <SecureImg
                src={safe}
                alt={name || ""}
                title={title}
                className={className}
                style={{
                    width: size, height: size, borderRadius: "50%", objectFit: "cover"
                }}
            />
        );
    }
    // кружок с инициалами
    return (
        <div
            className={className}
            title={title}
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                color: "white",
                background: colorFrom(name),
                userSelect: "none"
            }}
        >
            {initials(name)}
        </div>
    );
}
