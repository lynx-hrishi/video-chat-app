const rooms = new Map();
const lastReactionAt = new Map();

const getInformationOfRooms = (roomId) => rooms.get(roomId);

function createRoom({ roomId, hostUserId }) {
  const room = {
    id: roomId,
    hostUserId,
    anyoneCanJoin: false,
    participants: new Map(),
    media: new Map(),
    names: new Map(),
    approvedUsers: new Set(),
    pendingRequest: null,
    offer: null,
    offerFrom: null,
  };
  rooms.set(roomId, room);
  return room;
}

function joinRoom({ roomId, userId, socket, io, name = "", micOn = true, cameraOn = true, approved = false }) {
  let room = rooms.get(roomId);
  if (!room) room = createRoom({ roomId, hostUserId: userId });
  if (userId !== room.hostUserId && !room.anyoneCanJoin && !approved && !room.approvedUsers.has(userId)) {
    socket.emit("join-error", { message: "This room requires the host's approval." });
    return false;
  }
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
  room.media.set(userId, { micOn: Boolean(micOn), cameraOn: Boolean(cameraOn) });
  room.names.set(userId, String(name || "").trim().slice(0, 40));
  socket.join(roomId);
  socket.emit("room-joined", {
    count: room.participants.size,
    userId,
    name: room.names.get(userId),
    isHost: userId === room.hostUserId,
    settings: { anyoneCanJoin: room.anyoneCanJoin },
  });
  const peer = [...room.participants.entries()].find(([id]) => id !== userId);
  if (peer) {
    socket.emit("peer-media-state", { userId: peer[0], ...room.media.get(peer[0]) });
    socket.emit("peer-name", { userId: peer[0], name: room.names.get(peer[0]) });
    socket.to(roomId).emit("user-connected", {
      userId, count: room.participants.size, reoffer: true,
      name: room.names.get(userId), ...room.media.get(userId),
    });
  }
  if (userId === room.hostUserId && room.pendingRequest) {
    socket.emit("join-request", room.pendingRequest);
  }
  if (room.offer && room.participants.size === 2) socket.emit("offer", { offer: room.offer, from: room.offerFrom });
  return true;
}

function requestJoin({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room) { socket.emit("join-error", { message: "This room does not exist or has expired." }); return; }
  if (room.participants.has(data.userId)) {
    joinRoom({ ...data, socket, io, approved: true });
    return;
  }
  if (room.participants.size >= 2) { socket.emit("room-full"); return; }
  if (data.userId === room.hostUserId || room.anyoneCanJoin || room.approvedUsers.has(data.userId)) {
    joinRoom({ ...data, socket, io, approved: true });
    return;
  }
  if (room.pendingRequest && room.pendingRequest.userId !== data.userId) {
    socket.emit("room-full");
    return;
  }
  const request = {
    requestId: socket.id,
    userId: data.userId,
    name: String(data.name || "").trim().slice(0, 40),
    micOn: Boolean(data.micOn),
    cameraOn: Boolean(data.cameraOn),
  };
  room.pendingRequest = request;
  socket.emit("join-request-pending");
  const hostSocketId = room.participants.get(room.hostUserId);
  if (hostSocketId) io.to(hostSocketId).emit("join-request", request);
}

function respondToJoinRequest({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room || data.userId !== room.hostUserId || room.participants.get(room.hostUserId) !== socket.id) return;
  const request = room.pendingRequest;
  if (!request || request.requestId !== data.requestId) return;
  room.pendingRequest = null;
  const requester = io.sockets.sockets.get(request.requestId);
  if (!data.accepted) {
    requester?.emit("join-request-declined");
    return;
  }
  if (room.participants.size >= 2 || !requester?.connected) {
    requester?.emit("room-full");
    return;
  }
  room.approvedUsers.add(request.userId);
  joinRoom({ roomId: data.roomId, ...request, socket: requester, io, approved: true });
}

function updateRoomSettings({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room || data.userId !== room.hostUserId || room.participants.get(room.hostUserId) !== socket.id) return;
  room.anyoneCanJoin = Boolean(data.anyoneCanJoin);
  socket.emit("room-settings", { anyoneCanJoin: room.anyoneCanJoin });
  if (room.anyoneCanJoin && room.pendingRequest) {
    const request = room.pendingRequest;
    room.pendingRequest = null;
    const requester = io.sockets.sockets.get(request.requestId);
    if (requester?.connected && room.participants.size < 2) {
      room.approvedUsers.add(request.userId);
      joinRoom({ roomId: data.roomId, ...request, socket: requester, io, approved: true });
    } else requester?.emit("room-full");
  }
}

function updateParticipantName({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room?.participants.has(data.userId) || room.participants.get(data.userId) !== socket.id) return;
  const name = String(data.name || "").trim().slice(0, 40);
  room.names.set(data.userId, name);
  io.to(data.roomId).emit("peer-name", { userId: data.userId, name });
}

function cancelJoinRequest({ data, socket, io }) {
  const room = rooms.get(data.roomId);
  if (!room?.pendingRequest || room.pendingRequest.requestId !== socket.id) return;
  const userId = room.pendingRequest.userId;
  room.pendingRequest = null;
  const hostSocketId = room.participants.get(room.hostUserId);
  if (hostSocketId) io.to(hostSocketId).emit("join-request-cancelled", { userId });
}

function removeParticipant(roomId, userId, socket, io) {
  const room = rooms.get(roomId);
  if (!room) return;
  const currentSocket = room.participants.get(userId);
  if (currentSocket && socket && currentSocket !== socket.id) return;
  room.participants.delete(userId);
  room.media.delete(userId);
  room.names.delete(userId);
  if (socket) socket.leave(roomId);
  if (userId === room.hostUserId && room.pendingRequest) {
    const pendingSocket = io?.sockets?.sockets?.get(room.pendingRequest.requestId);
    pendingSocket?.emit("join-error", { message: "The host left before your request was answered." });
    room.pendingRequest = null;
  }
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
function disconnectUserSocketHandler({ r_id, u_id, socket, io }) { removeParticipant(r_id, u_id, socket, io); }
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
function disconnectSocketHandler({ socket, io }) {
  lastReactionAt.delete(socket.id);
  for (const [roomId, room] of rooms) {
    if (room.pendingRequest?.requestId === socket.id) room.pendingRequest = null;
    const participant = [...room.participants.entries()].find(([, socketId]) => socketId === socket.id);
    if (participant) removeParticipant(roomId, participant[0], socket, io);
  }
}

export { rooms, getInformationOfRooms, createRoom, joinRoom, requestJoin, respondToJoinRequest, cancelJoinRequest, updateRoomSettings, updateParticipantName, offerSocketHandler, updateOfferSocketHandler, answerSocketHandler, iceCandidateSocketHandler, disconnectUserSocketHandler, disconnectSocketHandler, messageSocketHandler, mediaStateSocketHandler, shareStateSocketHandler, chatMessageSocketHandler, reactionSocketHandler };
