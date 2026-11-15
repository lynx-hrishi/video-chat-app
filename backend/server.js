import express from "express";
import { Server } from "socket.io";
import http from "http";
import { v4 } from "uuid";
import cors from "cors";
import dotenv from "dotenv";
import { loggerMiddleware } from "./utils/logger.js";
import { answerSocketHandler, disconnectSocketHandler, disconnectUserSocketHandler, iceCandidateSocketHandler, offerSocketHandler, updateOfferSocketHandler, rooms, getInformationOfRooms, messageSocketHandler, joinRoom, mediaStateSocketHandler, shareStateSocketHandler, chatMessageSocketHandler, reactionSocketHandler } from "./services/socketServices.js";

dotenv.config({ quiet: true });

const app = express();
const server = http.createServer(app);
const uuidV4 = v4;

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174", "https://video-chat-app-cevy.onrender.com"];
const corsOptions = {
    origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // allow
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["*"]
}

const io = new Server(server, {
    cors: { origin: allowedOrigins }
});

app.use(cors(corsOptions));
app.use(loggerMiddleware);
app.get("/", (req, res) => res.json({ message: "Hello from Video Chat App" }));

app.get("/api/create-room", (req, res) => {
    return res.json({ roomId: uuidV4(), userId: uuidV4() });
});

app.get("/api/get-user-id/:roomId", (req, res) => {
    const { roomId } = req.params;

    if (!roomId || !(roomId.length === 36)){
        return res.status(400).json({ message: "Invalid Room ID" });
    }

    const room = getInformationOfRooms(roomId);
    if (!room && !/^[0-9a-f-]{36}$/i.test(roomId)) return res.status(400).json({ message: "Invalid room ID" });
    if (room && room.participants.size >= 2) return res.status(409).json({ message: "This room is full" });

    return res.json({ userId: uuidV4() });
});

io.on("connection", socket => {
    socket.on("join-room", (roomId, userId) => joinRoom({ roomId, userId, socket, io }));
    socket.on("disconnect-user", (r_id, u_id) => disconnectUserSocketHandler({ r_id, u_id, socket }));
    socket.on("disconnect", () => disconnectSocketHandler({ socket }));
    
    socket.on("offer", (data) => offerSocketHandler({ data, socket, io }));

    socket.on("update-offer", (data) => updateOfferSocketHandler({ data, socket, io }));

    socket.on("answer", (data) => answerSocketHandler({ data, io }));

    socket.on("ice-candidate", (data) => iceCandidateSocketHandler({ data, socket }));

    socket.on("message", (data) => messageSocketHandler({ data, socket }));
    socket.on("media-state", (data) => mediaStateSocketHandler({ data, socket }));
    socket.on("share-state", (data) => shareStateSocketHandler({ data, socket }));
    socket.on("chat-message", (data) => chatMessageSocketHandler({ data, socket }));
    socket.on("reaction", (data) => reactionSocketHandler({ data, socket }));
})

server.listen(3000, () => console.log(`Server at ${process.env.BACKEND_URL}`));
