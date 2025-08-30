import { useMemo } from "react";
import { getPinnedFingerprint, formatSafetyCode, forgetPinnedFingerprint } from "../../lib/crypto";

export default function SafetyCodeDialog({ userId, onClose }: { userId: number; onClose: ()=>void }) {
    const rec = useMemo(() => getPinnedFingerprint(userId), [userId]);
    const code = rec ? formatSafetyCode(rec.fp) : "не подтверждено";

    return (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:1000}} onClick={onClose}>
            <div style={{background:"#fff", borderRadius:12, padding:18, minWidth:360}} onClick={e=>e.stopPropagation()}>
                <h3 style={{margin:"0 0 8px"}}>Код безопасности</h3>
                <div style={{fontFamily:"monospace", fontSize:18, userSelect:"all"}}>{code}</div>
                {rec?.changed && (
                    <div style={{marginTop:8, color:"#b00020"}}>
                        Внимание: отпечаток ключей собеседника изменился.
                    </div>
                )}
                <div style={{marginTop:12, display:"flex", gap:8, justifyContent:"flex-end"}}>
                    <button onClick={onClose}>Закрыть</button>
                    <button onClick={() => { forgetPinnedFingerprint(userId); onClose(); }}>
                        Забыть пиннинг
                    </button>
                </div>
                {rec && (
                    <div style={{marginTop:10, fontSize:12, color:"#666"}}>
                        Первый раз: {new Date(rec.firstSeen).toLocaleString()}<br/>
                        Последний раз: {new Date(rec.lastSeen).toLocaleString()}
                    </div>
                )}
            </div>
        </div>
    );
}
