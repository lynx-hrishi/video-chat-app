import { ROOM_MAP } from "../models/roomMap.js"; 

let rooms = [];

function getInformationOfRooms(roomId){
    return rooms.find(r => r.id === roomId);
}

const offerSocketHandler = ({ data, socket }) => {
    try {
        const room = getInformationOfRooms(data.roomId);

        if (!room) {
            console.log(`Room created by ${socket.id}`);
            const newRoom = new ROOM_MAP();
            newRoom.createRoom(data.roomId, data.offer, socket.id, data.userId);
            rooms.push(newRoom);
            // console.log(rooms);
            return;
        }

        if (room.createrSocketId === socket.id) {
            console.log("Creator re-emmited the offer, Ignoring");
            return;
        }

        console.log(`Sending Existing Offer to ${socket.id}`);
        socket.emit("offer", room.offer);

        // Default version code:
        // socket.to(data.roomId).emit("offer", data.offer);
    }
    catch (err) {
        console.log({ name: "Socket Error", err });
        return;
    }
}

const updateOfferSocketHandler = ({ data, socket }) => {
    try {
        const room = getInformationOfRooms(data.roomId);
        room.offer = data.offer;
        room.createrSocketId = socket.id;
        rooms.splice(rooms[room], 1);
        rooms.push(room);
        console.log("\nNew Offer Updated");
    }
    catch (err) {
        console.log({ name: "Socket Error", err });
        return;
    }
}

const answerSocketHandler = ({ data, io }) => {
    const room = getInformationOfRooms(data.roomId);

    if (!room) return;

    console.log("Answer Recieved, Forwading to creator");
    io.to(room.createrSocketId).emit("answer", data.answer)

    // Default version code:
    // socket.to(data.roomId).emit("answer", data.answer);
}

const iceCandidateSocketHandler = ({ data, socket }) => {
    socket.to(data.roomId).emit("ice-candidate", data.candidate);
}

const disconnectUserSocketHandler = ({ r_id, u_id, socket}) => {
    try {
        socket.to(r_id).emit("user-disconnected", u_id);
        const room = getInformationOfRooms(r_id);
        console.log({room})
        const userIndex = room.participants.findIndex(u => u === u_id);
        if (userIndex === -1) {
            console.log("User already left the meeting", room.participants);
            return;
        }
        console.log({ userIndex })
        room.participants.splice(userIndex, 1);
        if (room.noOfPeople === 0) {
            const roomIndex = rooms.findIndex(r => r.id === roomId);
            rooms.splice(roomIndex, 1);
        }
        console.log(`${u_id} manually disconnected from room ${r_id}`);
        console.log(room.participants || "No Participants");
    }
    catch (err) {
        console.log({ name: "Socket Error", err });
        return;
    }
}

const disconnectSocketHandler = ({ userId, socket }) => {
    // room.offer = null;
    // console.log(`User Disconneted: ${socket.id}`);
    socket.broadcast.to(socket.id).emit("user-disconnect", userId);
}

const messageSocketHandler = ({ data, socket }) => socket.broadcast.emit("message", {message: data.message});

export {
    offerSocketHandler,
    updateOfferSocketHandler,
    answerSocketHandler,
    iceCandidateSocketHandler,
    disconnectUserSocketHandler,
    disconnectSocketHandler,
    rooms,
    getInformationOfRooms,
    messageSocketHandler,
}