import type { Participant as ApiParticipant } from "../../lib/api";
import dayjs from "dayjs";

/** Расширяем API-тип под UI нужды */
type Member = ApiParticipant & {
    isAdmin?: boolean | null;
    isOnline?: boolean | null;
};

type Props = {
    open: boolean;
    onClose: () => void;
    members: Member[];
    myId: number;
    onDM: (userId: number) => void;
    isGroup?: boolean;
    onRemoveMember?: (userId: number) => Promise<void> | void;
};

export default function MembersModal({
                                         open,
                                         onClose,
                                         members,
                                         myId,
                                         onDM,
                                         isGroup = true,
                                         onRemoveMember,
                                     }: Props) {
    const me = members.find((m) => m.id === myId);
    const iAmAdmin = !!me?.isAdmin;

    function prettyStatus(isOnline?: boolean | null, lastSeenUtc?: string | null) {
        if (isOnline) return "в сети";
        if (!lastSeenUtc) return "был(а) давно";
        const d = dayjs(lastSeenUtc);
        if (dayjs().isSame(d, "day")) return `был(а) сегодня в ${d.format("HH:mm")}`;
        return `был(а) ${d.format("DD.MM.YYYY в HH:mm")}`;
    }

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 1000,
            }}
            onMouseDown={onClose}
        >
            <div
                style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 16,
                    width: 460,
                    maxWidth: "92vw",
                    maxHeight: "75vh",
                    overflow: "auto",
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ margin: 0 }}>Участники</h3>
                    <button style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {members.map((m) => (
                        <li
                            key={m.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 6px",
                                borderBottom: "1px solid #eee",
                            }}
                        >
                            <img
                                src={m.avatarUrl || "/avatar.svg"}
                                alt=""
                                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                            />

                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 600,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {m.name}
                                    {m.isAdmin && (
                                        <span
                                            style={{
                                                marginLeft: 8,
                                                fontSize: 12,
                                                padding: "2px 6px",
                                                border: "1px solid #ddd",
                                                borderRadius: 6,
                                            }}
                                        >
                      Админ
                    </span>
                                    )}
                                    {m.id === myId && (
                                        <span style={{ marginLeft: 8, fontSize: 12, color: "#777" }}>это вы</span>
                                    )}
                                </div>

                                {/* только статус */}
                                <div style={{ fontSize: 12, color: "#777" }}>
                                    {prettyStatus(m.isOnline, m.lastSeenUtc)}
                                </div>
                            </div>

                            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                {m.id !== myId && <button onClick={() => onDM(m.id)}>Написать</button>}

                                {/* Исключение только если: группа, я админ, не себя, и цель не админ */}
                                {isGroup && iAmAdmin && m.id !== myId && !m.isAdmin && (
                                    <button
                                        style={{ color: "#b42318" }}
                                        onClick={async () => {
                                            if (!onRemoveMember) return;
                                            const ok = confirm(`Исключить ${m.name} из беседы?`);
                                            if (!ok) return;
                                            await onRemoveMember(m.id);
                                        }}
                                        title="Исключить из беседы"
                                    >
                                        Исключить
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
