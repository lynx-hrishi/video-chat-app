const rooms = new Map();
const lastReactionAt = new Map();

const getInformationOfRooms = (roomId) => rooms.get(roomId);

function joinRoom({ roomId, userId, socket, io }) {
  let room = rooms.get(roomId);
  if (!room) { room = { id: roomId, participants: new Map(), media: new Map(), offer: null, offerFrom: null }; rooms.set(roomId, room); }
  const oldSocketId = room.participants.get(userId);
  if (oldSocketId && oldSocketId !== socket.id) {
    io.sockets.sockets.get(oldSocketId)?.leave(roomId);
    room.participants.delete(userId);
    room.media.delete(userId);
    room.offer = null;
    room.offerFrom = null;
    socket.to(roomId).emit("user-disconnected", { userId });
  }
  if (room.participants.size >= 2) { socket.emit("room-full"); return false; }
  room.participants.set(userId, socket.id);
  if (!room.media.has(userId)) room.media.set(userId, { micOn: true, cameraOn: true });
  socket.join(roomId);
  socket.emit("room-joined", { count: room.participants.size });
  const peer = [...room.participants.entries()].find(([id]) => id !== userId);
  if (peer) {
    socket.emit("peer-media-state", { userId: peer[0], ...room.media.get(peer[0]) });
    socket.to(roomId).emit("user-connected", { userId, count: room.participants.size, reoffer: true });
  }
  if (room.offer && room.participants.size === 2) socket.emit("offer", { offer: room.offer, from: room.offerFrom });
  return true;
}

function removeParticipant(roomId, userId, socket) {
  const room = rooms.get(roomId);
  if (!room) return;
  const currentSocket = room.participants.get(userId);
  if (currentSocket && socket && currentSocket !== socket.id) return;
  room.participants.delete(userId);
  room.media.delete(userId);
  if (socket) socket.leave(roomId);
  socket?.to(roomId).emit("user-disconnected", { userId });
  socket?.to(roomId).emit("share-state", { userId, active: false });
  if (room.participants.size === 0) rooms.delete(roomId);
  else { room.offer = null; room.offerFrom = null; }
}

function offerSocketHandler({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room || !room.participants.has(data.userId)) return;
  room.offer = data.offer;
  room.offerFrom = data.userId;
  socket.to(data.roomId).emit("offer", { offer: data.offer, from: data.userId });
}
function answerSocketHandler({ data, io }) {
  const room = rooms.get(data.roomId);
  if (!room) return;
  const target = [...room.participants.entries()].find(([id]) => id !== data.userId);
  if (target) io.to(target[1]).emit("answer", { answer: data.answer, from: data.userId });
}
function iceCandidateSocketHandler({ data, socket }) { socket.to(data.roomId).emit("ice-candidate", { candidate: data.candidate, from: data.userId }); }
function disconnectUserSocketHandler({ r_id, u_id, socket }) { removeParticipant(r_id, u_id, socket); }
function messageSocketHandler({ data, socket }) { socket.to(data.roomId).emit("message", data); }
function mediaStateSocketHandler({ data, socket }) {
  const room = rooms.get(data.roomId);
  if (!room?.participants.has(data.userId)) return;
  const state = { micOn: Boolean(data.micOn), cameraOn: Boolean(data.cameraOn) };
  room.media.set(data.userId, state);
  socket.to(data.roomId).emit("peer-media-state", { userId: data.userId, ...state });
}
function shareStateSocketHandler({ data, socket }) {
  const room = rooms.get(data.roomId);
  if (room?.participants.has(data.userId)) socket.to(data.roomId).emit("share-state", { userId: data.userId, ...data.state });
}
function chatMessageSocketHandler({ data, socket }) {
  const room = rooms.get(data.roomId);
  const text = typeof data.text === "string" ? data.text.trim().slice(0, 1000) : "";
  if (!text || !room?.participants.has(data.userId) || room.participants.get(data.userId) !== socket.id) return;
  socket.to(data.roomId).emit("chat-message", { userId: data.userId, text, sentAt: Date.now() });
}
function reactionSocketHandler({ data, socket }) {
  const room = rooms.get(data.roomId);
  const now = Date.now();
  if (!room?.participants.has(data.userId) || room.participants.get(data.userId) !== socket.id || now - (lastReactionAt.get(socket.id) || 0) < 150) return;
  if (typeof data.emoji !== "string" || !data.emoji.trim() || data.emoji.length > 12) return;
  lastReactionAt.set(socket.id, now);
  socket.to(data.roomId).emit("reaction", { userId: data.userId, emoji: data.emoji.trim() });
}
function updateOfferSocketHandler({ data, socket, io }) { offerSocketHandler({ data, socket, io }); }
function disconnectSocketHandler({ socket }) {
  lastReactionAt.delete(socket.id);
  for (const [roomId, room] of rooms) {
    const participant = [...room.participants.entries()].find(([, socketId]) => socketId === socket.id);
    if (participant) removeParticipant(roomId, participant[0], socket);
  }
}

export { rooms, getInformationOfRooms, joinRoom, offerSocketHandler, updateOfferSocketHandler, answerSocketHandler, iceCandidateSocketHandler, disconnectUserSocketHandler, disconnectSocketHandler, messageSocketHandler, mediaStateSocketHandler, shareStateSocketHandler, chatMessageSocketHandler, reactionSocketHandler };
