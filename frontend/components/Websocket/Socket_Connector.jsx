import { io } from "socket.io-client";

// const socket = io('https://video-chat-app-cevy.onrender.com', { transports: ["websocket", "polling"] });
const socket = io('http://localhost:3000', { transports: ["websocket", "polling"] });
export default socket;