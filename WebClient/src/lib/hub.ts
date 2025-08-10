import * as signalR from "@microsoft/signalr";

export function createHub(getToken: () => string | null) {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/chatHub", {
            accessTokenFactory: () => getToken() || localStorage.getItem("token") || ""
        })
        .withAutomaticReconnect()
        .build();

    async function start() {
        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
        }
    }

    return {
        connection,
        start,
        joinChat: (chatId: number) => connection.invoke("JoinChat", chatId),
        leaveChat: (chatId: number) => connection.invoke("LeaveChat", chatId),
        typing: (chatId: number) => connection.invoke("Typing", chatId),

        onMessage: (cb: (m: any) => void) => connection.on("MessageCreated", cb),
        offMessage: (cb: (m: any) => void) => connection.off("MessageCreated", cb),

        onTyping: (cb: (p: { chatId: number; userId: number; displayName?: string }) => void) =>
            connection.on("UserTyping", cb),
        offTyping: (cb: (p: { chatId: number; userId: number; displayName?: string }) => void) =>
            connection.off("UserTyping", cb),
    };
}
