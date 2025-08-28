type Props = {
    name: string;
    progress?: number;      // 0..100
    onRemove?: () => void;
    thumbUrl?: string;
};

export function AttachedChip({ name, progress, onRemove, thumbUrl }: Props) {
    const showBar = typeof progress === "number" && progress < 100;
    return (
        <div style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            minWidth: 160
        }}>
            {thumbUrl ? (
                <img src={thumbUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
            ) : (
                <span>📎</span>
            )}
            <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
        {name}
      </span>
            {onRemove && (
                <button onClick={onRemove} title="Убрать"
                        style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer" }}>✖</button>
            )}
            {showBar && (
                <div style={{
                    position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
                    background: "#eef2ff", borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: "hidden"
                }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "#4473ff" }} />
                </div>
            )}
        </div>
    );
}
