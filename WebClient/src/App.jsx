import {useState, useEffect, useRef} from 'react';
import MessageList from "./components/MessageList";
import ChatList from "./components/ChatList";
import MessageInput from "./components/MessageInput";
import axios from "axios";
import './App.css';
import UserProfile from "./components/UserProfile";
import * as signalR from "@microsoft/signalr";

const API_BASE = "http://localhost:5157/api";

function App() {
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(1);
    const [users, setUsers] = useState([]);
    const [typingUsers, setTypingUsers] = useState({});
    const [typingTimers, setTypingTimers] = useState({});

    const connection = useRef(null);

    useEffect(() => {
        if (!connection.current) return;

        const conn = connection.current;

        if (conn.state === signalR.HubConnectionState.Connected) {
            conn.invoke("RegisterUser", currentUserId);
        } else if (conn.state === signalR.HubConnectionState.Disconnected) {
            conn.start()
                .then(() => conn.invoke("RegisterUser", currentUserId))
                .catch(err => console.error("Ошибка подключения:", err));
        }
    }, [currentUserId]);

    useEffect(() => {
        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl("http://localhost:5157/chatHub", {
                withCredentials: true,
                transport: signalR.HttpTransportType.WebSockets,
                skipNegotiation: true
        })
            .withAutomaticReconnect()
            .build();

        connection.current = newConnection;

        newConnection.start().then(() => {
            console.log("SignalR connected");


            newConnection.invoke("RegisterUser", currentUserId);
        }).catch(err => console.error("SignalR Connection error:", err));

        newConnection.on("UserTyping", (chatId, userId) => {
            if (selectedChat?.id === chatId && userId !== currentUserId) {
                setTypingUsers(prev => ({ ...prev, [chatId]: true}));

                setTimeout(() => {
                    setTypingUsers(prev => ({ ...prev, [chatId]: false}));
                }, 2000);
            }
        });

        newConnection.on("UserStatusChanged", (userId, status, lastSeen) => {
            setUsers(prevUsers => prevUsers.map(user => user.id === userId ? {
                ...user,
                status,
                lastSeen: lastSeen ? new Date(lastSeen) :  user.lastSeen} : user));

            });

        return () => {newConnection.stop();
        }
        }, []);


    useEffect(() => {
        axios.get(`${API_BASE}/user`)
        .then((response) => setUsers(response.data))
            .catch((error) => {console.error("Ошибка загрузки пользователей",error);});
    }, []);

    useEffect(() => {
        axios.get(`${API_BASE}/chat`)
            .then(res => setChats(res.data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (selectedChat) {
            axios.get(`${API_BASE}/message/chat/${selectedChat.id}`)
                .then(res => {
                    const enrichedMessages = res.data.map(msg=> {
                        const sender = users.find(user => user.id === msg.senderId);
                        return {... msg,
                        senderName: sender?sender.name : `Пользователь ${msg.senderId}`};
                    });
                    setMessages(enrichedMessages);
                });

        }
    },[selectedChat, users]);


    const handleTyping = () => {
        const conn = connection.current;

        if (conn && selectedChat) {
            conn.invoke("SendTyping", selectedChat.id, currentUserId);
        }
    };


    const handleSend = async (text, attachments = []) => {
        if ((!text || text.trim() === "") && attachments.length === 0) return;

        try {
            const sender = users.find(user => user.id === currentUserId);

            const msg = {
                chatId: selectedChat.id,
                senderId: currentUserId,
                content: text,
                attachments: attachments, // уже загруженные с filePath
                senderName: sender?.name || `Пользователь ${currentUserId}`
            };

            const res = await axios.post(`${API_BASE}/message`, msg);

            setMessages(prev => [...prev, {
                ...res.data,
                senderName: msg.senderName
            }]);
        } catch (err) {
            console.error("Ошибка при отправке:", err);
        }
    };



    const selectedUser = users && selectedChat?.userIds
        ? users.find(
            user => user.id !== currentUserId &&
                selectedChat.userIds.includes(user.id)
        )
        : null;

    console.log("👤 Selected user for profile:", selectedUser);

    return (
        <div className="app-container">
            <div className="sidebar">
                <select onChange={(e) => setCurrentUserId(Number(e.target.value))} value={currentUserId}>
                    <option value={1}>Алиса</option>
                    <option value={2}>Боб</option>
                </select>
                <ChatList
                    chats={chats}
                    selectedChat={selectedChat}
                    onSelect={setSelectedChat}
                    users={users}
                    currentUserId={currentUserId}
                />
            </div>

            <div className="chat-window">
                {selectedChat ? (
                    <>
                        <div className="chat-header">
                            <UserProfile
                                chat={selectedChat}
                                currentUserId={currentUserId}
                                users={users}
                            />
                        </div>

                        <div className="message-list">
                            <MessageList messages={messages} currentUserId={currentUserId} />

                            {/* Индикатор печатает — перемещаем сюда */}
                            {Object.entries(typingUsers).map(([id, typing]) => {
                                if (typing && parseInt(id) !== currentUserId) {
                                    const user = users.find(u => u.id === parseInt(id));
                                    return (
                                        <div key={id} className="typing-indicator">
                                            {user?.name} печатает...
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>

                        <div className="message-input-wrapper">
                            <MessageInput onSend={handleSend} onTyping={handleTyping} />
                        </div>
                    </>
                ) : (
                    <div className="no-chat"><h2>Выберите чат</h2></div>
                )}
            </div>

        </div>
    );

}
export default App;
