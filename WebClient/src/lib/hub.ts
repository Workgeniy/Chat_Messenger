// src/lib/hub.ts
import * as signalR from "@microsoft/signalr";

export type ReactionPayload = { messageId:number; userId:number; emoji:string };
export type IncomingMessage = {
    id:number; chatId:number; text:string; senderId:number; sentUtc:string;
    attachments?: Array<{ id:number|string; url?:string; contentType?:string }>;
};
export type TypingPayload = { chatId:number; userId:number; displayName?:string };

// новое, единое для «галочек»
export type SeenUpdatedPayload = {
    chatId: number;
    userId: number;
    lastSeenMessageId: number; // именно такое имя поле ждёт App.tsx
};

export function createHub(getToken: () => string | null) {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chathub", { accessTokenFactory: () => getToken() ?? "" })
        .withAutomaticReconnect()
        .build();

    async function start() {
        if (connection.state !== signalR.HubConnectionState.Connected) {
            await connection.start();
        }
    }

    // -------- seen (read receipts) --------
    // основное, используемое в App.tsx
    function onSeenUpdated(h: (p: SeenUpdatedPayload) => void) {
        connection.on("SeenUpdated", h);
    }
    function offSeenUpdated(h: (p: SeenUpdatedPayload) => void) {
        connection.off("SeenUpdated", h);
    }

    // обратная совместимость с прежним названием/форматом (если сервер шлёт "SeenUpTo")
    function onSeenUpTo(h: (p:{chatId:number; userId:number; upToMessageId:number}) => void) {
        connection.on("SeenUpTo", h);
    }
    function offSeenUpTo(h: any) { connection.off("SeenUpTo", h); }

    // -------- реакции --------
    function onReactionAdded(h:(p:ReactionPayload)=>void)  { connection.on("ReactionAdded", h); }
    function offReactionAdded(h:(p:ReactionPayload)=>void) { connection.off("ReactionAdded", h); }
    function onReactionRemoved(h:(p:ReactionPayload)=>void)  { connection.on("ReactionRemoved", h); }
    function offReactionRemoved(h:(p:ReactionPayload)=>void) { connection.off("ReactionRemoved", h); }

    // -------- сообщения --------
    function onMessage(cb:(m:IncomingMessage)=>void)  { connection.on("MessageCreated", cb); }
    function offMessage(cb:(m:IncomingMessage)=>void) { connection.off("MessageCreated", cb); }

    // -------- typing --------
    function typing(chatId:number) { return connection.invoke("Typing", chatId); }
    function onTyping(cb:(p:TypingPayload)=>void)  { connection.on("UserTyping", cb); }
    function offTyping(cb:(p:TypingPayload)=>void) { connection.off("UserTyping", cb); }

    // -------- правки/удаления --------
    function onEdited(h: (p:{ id:number; chatId:number; text:string; editedUtc:string }) => void) {
        connection.on("MessageEdited", h);
    }
    function offEdited(h:any){ connection.off("MessageEdited", h); }

    function onDeleted(h: (p:{ id:number; chatId:number }) => void) {
        connection.on("MessageDeleted", h);
    }
    function offDeleted(h:any){ connection.off("MessageDeleted", h); }

    return {
        connection,
        start,
        joinChat: (chatId:number) => connection.invoke("JoinChat", chatId),
        leaveChat: (chatId:number) => connection.invoke("LeaveChat", chatId),

        typing,
        onTyping,
        offTyping,

        onMessage,
        offMessage,

        onReactionAdded,
        offReactionAdded,
        onReactionRemoved,
        offReactionRemoved,

        onEdited,
        offEdited,
        onDeleted,
        offDeleted,

        // read receipts
        onSeenUpdated,
        offSeenUpdated,

        // совместимость со старым названием
        onSeenUpTo,
        offSeenUpTo,
    };
}
