// src/lib/hub.ts
import * as signalR from "@microsoft/signalr";

/** ---- payload types ---- */
export type ReactionPayload = { messageId: number; userId: number; emoji: string };
export type IncomingMessage = {
    id: number;
    chatId: number;
    text: string;
    senderId: number;
    sentUtc: string;
    attachments?: Array<{ id: number | string; url?: string; contentType?: string }>;
};
export type TypingPayload = { chatId: number; userId: number; displayName?: string };
export type SeenUpdatedPayload = { chatId: number; userId: number; lastSeenMessageId: number };
export type PresencePayload = { userId: number; isOnline: boolean; lastSeenUtc?: string | null };

/** Фабрика хаба */
export function createHub(getToken: () => string | null) {
    const HUB_URL = import.meta.env.VITE_HUB_URL ?? "/chatHub";
    const connection = new signalR.HubConnectionBuilder()
        // ВАЖНО: регистр! сервер мапит /chatHub
        .withUrl(HUB_URL, { accessTokenFactory: () => getToken() ?? "" })
        .withAutomaticReconnect()
        .build();

    /** гарантируем старт перед invoke */
    async function ensureStarted() {
        if (connection.state !== signalR.HubConnectionState.Connected) {
            await connection.start();
        }
    }

    /** публичный start, если хочется стартовать руками */
    async function start() {
        await ensureStarted();
    }

    /** --- read receipts --- */
    function onSeenUpdated(h: (p: SeenUpdatedPayload) => void) {
        connection.on("SeenUpdated", h);
    }
    function offSeenUpdated(h: (p: SeenUpdatedPayload) => void) {
        connection.off("SeenUpdated", h);
    }
    // совместимость со старым названием события
    function onSeenUpTo(h: (p: { chatId: number; userId: number; upToMessageId: number }) => void) {
        connection.on("SeenUpTo", h);
    }
    function offSeenUpTo(h: (p: { chatId: number; userId: number; upToMessageId: number }) => void) {
        connection.off("SeenUpTo", h);
    }

    /** --- presence (онлайн/lastSeen) --- */
    function onPresenceChanged(h:(p:{userId:number; isOnline:boolean; lastSeenUtc?:string|null})=>void){
        connection.on("PresenceChanged", h);
    }
    function offPresenceChanged(h:(p:{userId:number; isOnline:boolean; lastSeenUtc?:string|null})=>void){
        connection.off("PresenceChanged", h);
    }

    /** --- реакции --- */
    function onReactionAdded(h: (p: ReactionPayload) => void) {
        connection.on("ReactionAdded", h);
    }
    function offReactionAdded(h: (p: ReactionPayload) => void) {
        connection.off("ReactionAdded", h);
    }
    function onReactionRemoved(h: (p: ReactionPayload) => void) {
        connection.on("ReactionRemoved", h);
    }
    function offReactionRemoved(h: (p: ReactionPayload) => void) {
        connection.off("ReactionRemoved", h);
    }

    /** --- сообщения --- */
    function onMessage(cb: (m: IncomingMessage) => void) {
        connection.on("MessageCreated", cb);
    }
    function offMessage(cb: (m: IncomingMessage) => void) {
        connection.off("MessageCreated", cb);
    }

    /** --- правки/удаления --- */
    function onEdited(h: (p: { id: number; chatId: number; text: string; editedUtc: string }) => void) {
        connection.on("MessageEdited", h);
    }
    function offEdited(h: (p: { id: number; chatId: number; text: string; editedUtc: string }) => void) {
        connection.off("MessageEdited", h);
    }
    function onDeleted(h: (p: { id: number; chatId: number }) => void) {
        connection.on("MessageDeleted", h);
    }
    function offDeleted(h: (p: { id: number; chatId: number }) => void) {
        connection.off("MessageDeleted", h);
    }

    /** --- typing --- */
    async function typing(chatId: number) {
        await ensureStarted();
        await connection.invoke("Typing", chatId);
    }
    function onTyping(cb: (p: TypingPayload) => void) {
        connection.on("UserTyping", cb);
    }
    function offTyping(cb: (p: TypingPayload) => void) {
        connection.off("UserTyping", cb);
    }

    /** --- группы чатов --- */
    async function joinChat(chatId: number) {
        await ensureStarted();
        await connection.invoke("JoinChat", chatId);
    }
    async function leaveChat(chatId: number) {
        await ensureStarted();
        await connection.invoke("LeaveChat", chatId);
    }

    /** полезно иметь stop */
    async function stop() {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
            await connection.stop();
        }
    }

    return {
        connection,
        start,
        stop,

        // groups
        joinChat,
        leaveChat,

        // typing
        typing,
        onTyping,
        offTyping,

        // messages
        onMessage,
        offMessage,

        // reactions
        onReactionAdded,
        offReactionAdded,
        onReactionRemoved,
        offReactionRemoved,

        // edits/deletes
        onEdited,
        offEdited,
        onDeleted,
        offDeleted,

        // read receipts
        onSeenUpdated,
        offSeenUpdated,
        onSeenUpTo,
        offSeenUpTo,

        // presence
        onPresenceChanged,
        offPresenceChanged,
    };
}
