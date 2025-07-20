import {useState, useEffect} from 'react';
import MessageList from "./components/MessageList";
import ChatList from "./components/ChatList";
import MessageInput from "./components/MessageInput";
import axios from "axios";
import './App.css';

const API_BASE = "http://localhost:5157/api";

function App() {
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(1);
    const [users, setUsers] = useState([]);

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

    const handleSend = (text) => {
        console.log("Отправка сообщения:", text);

        if (!text || !selectedChat) return;

        const sender = users.find(user => user.id === currentUserId);

        const msg = {
            chatId: selectedChat.id,
            senderId: currentUserId,
            content: text,
            attachments: [],
            senderName: sender?.name || 'Пользователь ${currentUserId}'
        };

        axios.post(`${API_BASE}/message`, msg)
            .then(res => {
                console.log("Ответ сервера:", res.data);
                console.log("msg:", msg);
                setMessages(prev => [...prev,{...res.data, senderName: msg.senderName}]);
            })
            .catch(err => console.error("Ошибка при отправке:", err));
    };
    return (
        <div className="app-container">
            <div className="sidebar">
                <select onChange={(e) => setCurrentUserId(Number(e.target.value))} value={currentUserId}>
                    <option value={1}>Боб</option>
                    <option value={2}>Алиса</option>
                </select>
                <ChatList chats={chats} selectedChat={selectedChat} onSelect={setSelectedChat} />
            </div>

            <div className="chat-window">
                {selectedChat ? (
                    <>
                        <p>Чат #{selectedChat.id}</p>
                        <div className="chat-header">Чат #{selectedChat.id}</div>
                        <div className="message-list">
                            <MessageList messages={messages} currentUserId={currentUserId}/>
                        </div>
                        <div className="message-input-wrapper">
                            <MessageInput onSend={handleSend} />
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
