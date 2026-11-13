import express from "express";
import { Server } from "socket.io";
import http from "http";
import { v4 } from "uuid";
import cors from "cors";
import { loggerMiddleware } from "./utils/logger.js";

const app = express();
const server = http.createServer(app);
const uuidV4 = v4;

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
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
    if (!room) return res.status(400).json({ message: "Room does not exist" });

    return res.json({ userId: uuidV4() });
});

class ROOM_MAP {
    constructor(){
        this.id;
        this.offer;
        this.createrSocketId
        this.participants = [];
    }

    createRoom(id, offer, createrSocketId, participant){
        this.id = id;
        this.offer = offer;
        this.createrSocketId = createrSocketId;
        this.participants = [...this.participants, participant];
        this.noOfPeoples = this.participants.length;
    }
}
let rooms = []

function getInformationOfRooms(roomId){
    return rooms.find(r => r.id === roomId);
}

io.on("connection", socket => {
    socket.on("join-room", (roomId, userId) => {
        console.log({ roomId, userId });
        socket.join(roomId);
        socket.broadcast.to(roomId).emit("user-connected", userId);
        
        const room = getInformationOfRooms(roomId);
        if (room && room.offer){
            room.participants.push(userId);
            console.log(room.participants)
            socket.emit("offer", room.offer);
        }

        socket.on("disconnect-user", (r_id, u_id) => {
            try{
                socket.to(r_id).emit("user-disconnected", u_id);
                const room = getInformationOfRooms(r_id);
                const userIndex = room.participants.findIndex(u => u === u_id);
                if (userIndex === -1) {
                    console.log("User already left the meeting", room.participants);
                    return;
                }
                console.log({userIndex})
                room.participants.splice(userIndex, 1);
                if (room.noOfPeople === 0){
                    const roomIndex = rooms.findIndex(r => r.id === roomId);
                    rooms.splice(roomIndex, 1);
                } 
                console.log(`${u_id} manually disconnected from room ${r_id}`);
                console.log(room.participants || "No Participants");
            }
            catch(err){
                console.log({ name: "Socket Error", err });
                return;
            }
        })

        socket.on("disconnect", () => {
            // room.offer = null;
            // console.log(`User Disconneted: ${socket.id}`);
            socket.broadcast.to(roomId).emit("user-disconnect", userId); 
        });
    });
    
    socket.on("offer", (data) => {
        try{
            const room = getInformationOfRooms(data.roomId);

            if (!room){
                console.log(`Room created by ${socket.id}`);
                const newRoom = new ROOM_MAP();
                newRoom.createRoom(data.roomId, data.offer, socket.id, data.userId);
                rooms.push(newRoom);
                console.log(rooms)
                return;
            }

            if (room.createrSocketId === socket.id){
                console.log("Creator re-emmited the offer, Ignoring");
                return;
            }
        
            console.log(`Sending Existing Offer to ${socket.id}`);
            socket.emit("offer", room.offer);

            // Default version code:
            // socket.to(data.roomId).emit("offer", data.offer);
        }
        catch(err){
            console.log({ name: "Socket Error", err });
            return;
        }
    });

    socket.on("update-offer", (data) => {
        try{
            const room = getInformationOfRooms(data.roomId); 
            room.offer = data.offer;
            room.createrSocketId = socket.id;
            rooms.splice(rooms[room], 1);
            rooms.push(room);
            console.log("\nNew Offer Updated");
        }
        catch(err){
            console.log({ name: "Socket Error", err });
            return;
        }
    });  

    socket.on("answer", (data) => {
        const room = getInformationOfRooms(data.roomId);

        if(!room) return;

        console.log("Answer Recieved, Forwading to creator");
        io.to(room.createrSocketId).emit("answer", data.answer)

        // Default version code:
        // socket.to(data.roomId).emit("answer", data.answer);
    });

    socket.on("ice-candidate", (data) => {
        socket.to(data.roomId).emit("ice-candidate", data.candidate);
    });
})

server.listen(3000, () => console.log(`Server at http://localhost:3000`));