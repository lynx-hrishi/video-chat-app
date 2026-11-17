import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../components/Websocket/Socket_Connector";
import ThemeToggle from "../components/ThemeToggle";
import { getOrCreateRoomUserId } from "../utils/roomIdentity";
import "./Chatroom.css";

const playSound = (file) => {
  const audio = new Audio(`/sounds/${file}.mp3`);
  audio.volume = 0.45;
  audio.play().catch(() => {});
};

export default function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const userId = useMemo(() => getOrCreateRoomUserId(roomId), [roomId]);
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canCaptureScreen = window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === "function";
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const canvas = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const audioContext = useRef(null);
  const markerChannel = useRef(null);
  const drawing = useRef(false);
  const paintMarkerRef = useRef(() => {});
  const pendingMarkerMessages = useRef([]);
  const lastReactionAt = useRef(0);
  const pendingCandidates = useRef([]);
  const hasJoined = useRef(false);
  const mediaState = useRef({ micOn: true, cameraOn: true });
  const [callStage, setCallStage] = useState("prejoin");
  const [mediaReady, setMediaReady] = useState(false);
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("pair:displayName") || "");
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const [remoteName, setRemoteName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [anyoneCanJoin, setAnyoneCanJoin] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinRequest, setJoinRequest] = useState(null);
  const [joined, setJoined] = useState(false);
  const [remotePresent, setRemotePresent] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState({ micOn: true, cameraOn: true });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareAudio, setShareAudio] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [remoteShare, setRemoteShare] = useState(null);
  const [shareSize, setShareSize] = useState({ width: 16, height: 9 });
  const [notice, setNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const [chatDraft, setChatDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [unreadMessage, setUnreadMessage] = useState(false);
  const [customEmojiOpen, setCustomEmojiOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [reaction, setReaction] = useState(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);

  const makePeer = useCallback(() => {
    pc.current?.close();
    markerChannel.current = null;
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = connection;
    connection.ondatachannel = ({ channel }) => {
      if (channel.label !== "markers") return;
      markerChannel.current = channel;
      channel.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        paintMarkerRef.current(message);
      };
    };
    const stream = localStream.current;
    if (stream) stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.ontrack = (event) => {
      const incoming = event.streams[0];
      if (remoteVideo.current && incoming) remoteVideo.current.srcObject = incoming;
      setRemotePresent(true);
      playSound("call-join");
    };
    connection.onicecandidate = ({ candidate }) => candidate && socket.emit("ice-candidate", { roomId, candidate, userId });
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setRemotePresent(true);
      if (["failed", "disconnected", "closed"].includes(connection.connectionState)) setRemotePresent(false);
    };
    return connection;
  }, [roomId, userId]);

  const createOffer = useCallback(async () => {
    const connection = pc.current || makePeer();
    if (connection.signalingState !== "stable") return;
    if (!markerChannel.current || markerChannel.current.readyState === "closed") {
      markerChannel.current = connection.createDataChannel("markers");
    }
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    socket.emit("offer", { roomId, userId, offer });
  }, [makePeer, roomId, userId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        localStream.current = stream;
        stream.getAudioTracks().forEach((track) => { track.enabled = mediaState.current.micOn; });
        stream.getVideoTracks().forEach((track) => { track.enabled = mediaState.current.cameraOn; });
        if (localVideo.current) localVideo.current.srcObject = stream;
        if (pc.current) stream.getTracks().forEach((track) => {
          if (!pc.current.getSenders().some((sender) => sender.track?.kind === track.kind)) pc.current.addTrack(track, stream);
        });
        setMediaReady(true);
        setNotice("");
      } catch (error) {
        if (!active) return;
        localStream.current = new MediaStream();
        mediaState.current = { micOn: false, cameraOn: false };
        setMicOn(false);
        setCameraOn(false);
        setNotice(error.name === "NotAllowedError" ? "Camera and microphone are blocked. You can still join with both off." : "Camera and microphone are unavailable. You can still join with both off.");
        setMediaReady(true);
      }
    })();
    return () => {
      active = false;
      localStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [roomId]);

  useEffect(() => {
    if (callStage === "in-call" && localVideo.current) {
      localVideo.current.srcObject = sharing && screenStream.current ? screenStream.current : localStream.current;
    }
  }, [callStage, sharing]);

  useEffect(() => {
    const onRoomJoined = ({ isHost: host, settings }) => {
      setIsHost(Boolean(host));
      setAnyoneCanJoin(Boolean(settings?.anyoneCanJoin));
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach((track) => { track.enabled = mediaState.current.micOn; });
        localStream.current.getVideoTracks().forEach((track) => { track.enabled = mediaState.current.cameraOn; });
      }
      makePeer();
      hasJoined.current = true;
      setJoined(true);
      setCallStage("in-call");
      setNotice("");
      socket.emit("media-state", { roomId, userId, ...mediaState.current });
    };
    const onConnected = ({ userId: peerId, count, name, micOn: peerMic, cameraOn: peerCamera }) => {
      if (peerId === userId) return;
      setRemotePresent(true);
      setRemoteName(name || "");
      setRemoteMedia({ micOn: peerMic, cameraOn: peerCamera });
      setNotice("");
      if (count === 2) createOffer().catch(console.error);
    };
    const onPeerMedia = ({ userId: peerId, micOn: peerMic, cameraOn: peerCamera }) => {
      if (peerId !== userId) setRemoteMedia({ micOn: peerMic, cameraOn: peerCamera });
    };
    const onPeerName = ({ userId: peerId, name }) => { if (peerId !== userId) setRemoteName(name || ""); };
    const onRoomSettings = ({ anyoneCanJoin: allow }) => setAnyoneCanJoin(Boolean(allow));
    const onJoinRequest = (request) => setJoinRequest(request);
    const onJoinRequestPending = () => { setCallStage("waiting"); setNotice(""); };
    const onJoinRequestDeclined = () => { setCallStage("prejoin"); setNotice("The host declined your request to join."); };
    const onJoinError = ({ message }) => { setCallStage("prejoin"); setNotice(message || "Could not join this room."); };
    const onShareState = ({ userId: peerId, active, width, height }) => {
      if (peerId === userId) return;
      setRemoteShare(active ? { userId: peerId, width, height } : null);
      if (active) playSound("presentation-start");
      if (active && width && height) setShareSize({ width, height });
    };
    const onChatMessage = (message) => {
      setMessages((items) => [...items, message].slice(-100));
      if (message.userId !== userId) {
        playSound("message-arrival");
        if (!chatOpenRef.current) setUnreadMessage(true);
      }
    };
    const onReaction = ({ emoji, userId: peerId }) => {
      const key = Date.now() + Math.random();
      setReaction({ emoji, userId: peerId, key });
      window.setTimeout(() => setReaction((current) => current?.key === key ? null : current), 1900);
    };
    const onOffer = async ({ offer, from }) => {
      if (from === userId || !pc.current) return;
      try {
        const connection = pc.current;
        if (connection.signalingState !== "stable") await connection.setLocalDescription({ type: "rollback" });
        await connection.setRemoteDescription(offer);
        for (const candidate of pendingCandidates.current.splice(0)) await connection.addIceCandidate(candidate);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        socket.emit("answer", { roomId, answer, userId });
      } catch (error) { console.error("Offer negotiation failed", error); }
    };
    const onAnswer = async ({ answer }) => {
      try {
        if (!pc.current || pc.current.signalingState !== "have-local-offer") return;
        await pc.current.setRemoteDescription(answer);
        for (const candidate of pendingCandidates.current.splice(0)) await pc.current.addIceCandidate(candidate);
      } catch (error) { console.error("Answer negotiation failed", error); }
    };
    const onCandidate = async ({ candidate }) => {
      if (!pc.current) return;
      if (pc.current.remoteDescription) {
        try { await pc.current.addIceCandidate(candidate); } catch (error) { console.error(error); }
      } else pendingCandidates.current.push(candidate);
    };
    const onDisconnected = ({ userId: peerId }) => {
      if (peerId === userId) return;
      setRemotePresent(false);
      playSound("call-leave");
      setRemoteShare(null);
      setRemoteName("");
      setRemoteMedia({ micOn: true, cameraOn: true });
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
      pendingCandidates.current = [];
      makePeer();
      setNotice("Your guest left. Share the room link to invite them again.");
    };
    const onFull = () => { setCallStage("prejoin"); setNotice("This room already has two people."); };
    const onSocketReconnect = () => {
      if (!hasJoined.current || !localStream.current) return;
      pendingCandidates.current = [];
      socket.emit("join-room", { roomId, userId, name: displayNameRef.current, ...mediaState.current });
      socket.emit("media-state", { roomId, userId, ...mediaState.current });
    };
    const onJoinRequestCancelled = ({ userId: peerId }) => {
      setJoinRequest((request) => request?.userId === peerId ? null : request);
    };
    socket.on("room-joined", onRoomJoined);
    socket.on("user-connected", onConnected);
    socket.on("peer-media-state", onPeerMedia);
    socket.on("peer-name", onPeerName);
    socket.on("room-settings", onRoomSettings);
    socket.on("join-request", onJoinRequest);
    socket.on("join-request-pending", onJoinRequestPending);
    socket.on("join-request-declined", onJoinRequestDeclined);
    socket.on("join-error", onJoinError);
    socket.on("join-request-cancelled", onJoinRequestCancelled);
    socket.on("share-state", onShareState);
    socket.on("chat-message", onChatMessage);
    socket.on("reaction", onReaction);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onCandidate);
    socket.on("user-disconnected", onDisconnected);
    socket.on("room-full", onFull);
    socket.on("connect", onSocketReconnect);
    return () => {
      socket.off("room-joined", onRoomJoined);
      socket.off("user-connected", onConnected);
      socket.off("peer-media-state", onPeerMedia);
      socket.off("peer-name", onPeerName);
      socket.off("room-settings", onRoomSettings);
      socket.off("join-request", onJoinRequest);
      socket.off("join-request-pending", onJoinRequestPending);
      socket.off("join-request-declined", onJoinRequestDeclined);
      socket.off("join-error", onJoinError);
      socket.off("join-request-cancelled", onJoinRequestCancelled);
      socket.off("share-state", onShareState);
      socket.off("chat-message", onChatMessage);
      socket.off("reaction", onReaction);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onCandidate);
      socket.off("user-disconnected", onDisconnected);
      socket.off("room-full", onFull);
      socket.off("connect", onSocketReconnect);
      if (hasJoined.current) socket.emit("disconnect-user", roomId, userId);
      pc.current?.close();
      screenStream.current?.getTracks().forEach((track) => track.stop());
      hasJoined.current = false;
    };
  }, [roomId, userId, makePeer, createOffer]);

  const toggleTrack = (kind) => {
    const toggle = async () => {
      let track = localStream.current?.getTracks().find((item) => item.kind === kind);
      if (!track) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: kind === "audio", video: kind === "video" });
          track = stream.getTracks()[0];
          if (!localStream.current) localStream.current = new MediaStream();
          localStream.current.addTrack(track);
          if (callStage === "in-call" && pc.current) {
            pc.current.addTrack(track, localStream.current);
            createOffer().catch(console.error);
          }
          if (localVideo.current && kind === "video") localVideo.current.srcObject = localStream.current;
        } catch {
          setNotice(kind === "audio" ? "Microphone permission is needed to turn your mic on." : "Camera permission is needed to turn your camera on.");
          return;
        }
      }
      track.enabled = !track.enabled;
      if (kind === "audio") { setMicOn(track.enabled); mediaState.current.micOn = track.enabled; }
      else { setCameraOn(track.enabled); mediaState.current.cameraOn = track.enabled; }
      if (callStage === "in-call") socket.emit("media-state", { roomId, userId, ...mediaState.current });
    };
    toggle();
  };

  const requestToJoin = () => {
    const cleanName = displayName.trim().slice(0, 40);
    localStorage.setItem("pair:displayName", cleanName);
    setDisplayName(cleanName);
    mediaState.current = { micOn, cameraOn };
    if (localStream.current) localStream.current.getTracks().forEach((track) => { track.enabled = track.kind === "audio" ? micOn : cameraOn; });
    setCallStage("requesting");
    socket.emit("request-join", { roomId, userId, name: cleanName, micOn, cameraOn });
  };

  const cancelJoinRequest = () => {
    socket.emit("cancel-join-request", { roomId });
    setCallStage("prejoin");
  };

  const respondToRequest = (accepted) => {
    if (!joinRequest) return;
    socket.emit("respond-to-join-request", { roomId, userId, requestId: joinRequest.requestId, accepted });
    setJoinRequest(null);
  };

  const saveDisplayName = () => {
    const cleanName = displayName.trim().slice(0, 40);
    setDisplayName(cleanName);
    localStorage.setItem("pair:displayName", cleanName);
    if (callStage === "in-call") socket.emit("participant-name-update", { roomId, userId, name: cleanName });
    setNotice("Your name has been saved.");
  };

  const updateAnyoneCanJoin = (allow) => {
    setAnyoneCanJoin(allow);
    socket.emit("room-settings-update", { roomId, userId, anyoneCanJoin: allow });
  };

  const stopShare = useCallback(async () => {
    if (!screenStream.current) return;
    screenStream.current.getTracks().forEach((track) => track.stop());
    screenStream.current = null;
    const camera = localStream.current?.getVideoTracks()[0];
    const sender = pc.current?.getSenders().find((item) => item.track?.kind === "video");
    if (sender && camera) await sender.replaceTrack(camera);
    if (localVideo.current && localStream.current) localVideo.current.srcObject = localStream.current;
    const audioSender = pc.current?.getSenders().find((item) => item.track?.kind === "audio");
    const microphone = localStream.current?.getAudioTracks()[0];
    if (audioSender && microphone) await audioSender.replaceTrack(microphone);
    audioContext.current?.close(); audioContext.current = null;
    socket.emit("share-state", { roomId, userId, state: { active: false } });
    setSharing(false); setShareAudio(false); setMarkers(false);
  }, [roomId, userId]);

  const startShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      screenStream.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      const width = settings.width || 16; const height = settings.height || 9;
      setShareSize({ width, height });
      const sender = pc.current?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(videoTrack);
      if (localVideo.current) localVideo.current.srcObject = stream;
      const systemAudio = stream.getAudioTracks()[0];
      if (systemAudio) systemAudio.enabled = false;
      const microphone = localStream.current?.getAudioTracks()[0];
      const audioSender = pc.current?.getSenders().find((item) => item.track?.kind === "audio");
      if (systemAudio && microphone && audioSender) {
        const context = new AudioContext(); audioContext.current = context;
        const destination = context.createMediaStreamDestination();
        context.createMediaStreamSource(new MediaStream([microphone])).connect(destination);
        context.createMediaStreamSource(new MediaStream([systemAudio])).connect(destination);
        await audioSender.replaceTrack(destination.stream.getAudioTracks()[0]);
      }
      videoTrack.onended = () => stopShare();
      socket.emit("share-state", { roomId, userId, state: { active: true, width, height } });
      playSound("presentation-start");
      setSharing(true);
    } catch (error) { if (error.name !== "NotAllowedError") setNotice("Screen sharing could not be started."); }
  };

  const toggleShareAudio = () => {
    const track = screenStream.current?.getAudioTracks()[0];
    if (!track) { setNotice("Choose a browser tab or window with audio when starting screen share."); return; }
    track.enabled = !track.enabled;
    setShareAudio(track.enabled);
  };

  const paintMarker = useCallback((message) => {
    const surface = canvas.current;
    if (!surface) {
      if (message.action === "clear") pendingMarkerMessages.current = [message];
      else if (pendingMarkerMessages.current.length < 2000) pendingMarkerMessages.current.push(message);
      return;
    }
    const context = surface.getContext("2d");
    if (message.action === "clear") { context.clearRect(0, 0, surface.width, surface.height); return; }
    const point = message.points?.[0];
    if (!point) return;
    context.lineWidth = message.brushSize || Math.max(4, surface.width / 320); context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = message.color || "#f5c451";
    const x = point.x * surface.width; const y = point.y * surface.height;
    if (message.action === "start") { context.beginPath(); context.moveTo(x, y); }
    if (message.action === "draw") { context.lineTo(x, y); context.stroke(); }
  }, []);
  paintMarkerRef.current = paintMarker;
  useEffect(() => {
    if (!canvas.current || !pendingMarkerMessages.current.length) return;
    for (const message of pendingMarkerMessages.current.splice(0)) paintMarker(message);
  }, [sharing, remoteShare, shareSize, paintMarker]);
  const broadcastMarker = (message) => {
    paintMarker(message);
    if (markerChannel.current?.readyState === "open") markerChannel.current.send(JSON.stringify(message));
  };
  const clearCanvas = () => broadcastMarker({ action: "clear" });
  const normalizedMarkerPoint = (event) => {
    if (!canvas.current) return null;
    const box = canvas.current.getBoundingClientRect();
    const ratio = shareSize.width / shareSize.height;
    let left = box.left; let top = box.top; let width = box.width; let height = box.height;
    if (width / height > ratio) { width = height * ratio; left += (box.width - width) / 2; }
    else { height = width / ratio; top += (box.height - height) / 2; }
    const x = (event.clientX - left) / width; const y = (event.clientY - top) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };
  const beginMarker = (event) => {
    if (!markers) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = normalizedMarkerPoint(event);
    if (point) broadcastMarker({ action: "start", points: [point], color: "#f5c451", brushSize: 5 });
  };
  const moveMarker = (event) => {
    if (!drawing.current) return;
    const point = normalizedMarkerPoint(event);
    if (point) broadcastMarker({ action: "draw", points: [point], color: "#f5c451", brushSize: 5 });
  };

  const sendMessage = (event) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    socket.emit("chat-message", { roomId, userId, text });
    setMessages((items) => [...items, { userId, text, sentAt: Date.now() }].slice(-100));
    setChatDraft("");
  };

  const sendReaction = (emoji) => {
    const now = Date.now();
    if (!emoji || now - lastReactionAt.current < 150) return;
    lastReactionAt.current = now;
    socket.emit("reaction", { roomId, userId, emoji });
    const key = now + Math.random();
    setReaction({ emoji, userId, key });
    window.setTimeout(() => setReaction((current) => current?.key === key ? null : current), 1900);
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}/chat-room/${roomId}`);
    setNotice("Invite link copied.");
  };

  if (callStage !== "in-call") {
    return <main className="call-page prejoin-page">
      <header className="call-header"><a className="brand" href="/">◉ <span>pair</span></a><div className="ml-auto"><ThemeToggle mobileIconOnly /></div></header>
      <section className="prejoin-stage">
        <div className="prejoin-card">
          <div className="prejoin-eyebrow">ROOM {roomId.slice(0, 8).toUpperCase()}</div>
          <h1>{callStage === "waiting" ? "Waiting for approval" : callStage === "requesting" ? "Joining your call…" : "Ready to join?"}</h1>
          {callStage === "waiting" ? <p>Your request has been sent to the host.</p> : callStage === "requesting" ? <p>Connecting you to the room…</p> : <p>Choose how you want to appear before you enter.</p>}
          <div className="prejoin-preview">
            <video ref={localVideo} autoPlay playsInline muted />
            {!cameraOn && <div className="prejoin-camera-off">Camera off</div>}
            <span className="prejoin-name">{displayName.trim() || "Your name"}</span>
          </div>
          {callStage === "prejoin" && <>
            <label className="prejoin-field"><span>Your name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 40))} placeholder="Enter your name (optional)" maxLength={40} /></label>
            <div className="prejoin-media-controls">
              <button type="button" className={!micOn ? "is-off" : ""} onClick={() => toggleTrack("audio")}><span>{micOn ? "♩" : "♩̸"}</span><b>Microphone</b><small>{micOn ? "On" : "Off"}</small></button>
              <button type="button" className={!cameraOn ? "is-off" : ""} onClick={() => toggleTrack("video")}><span>{cameraOn ? "▣" : "▧"}</span><b>Camera</b><small>{cameraOn ? "On" : "Off"}</small></button>
            </div>
          </>}
          {notice && <p className="prejoin-notice" role="status">{notice}</p>}
          {callStage === "prejoin" ? <button className="prejoin-join" disabled={!mediaReady} onClick={requestToJoin}>{mediaReady ? "Join call" : "Preparing devices…"}</button> : callStage === "waiting" ? <button className="prejoin-secondary" onClick={cancelJoinRequest}>Cancel request</button> : null}
        </div>
      </section>
    </main>;
  }

  const markerScale = Math.min(1, 1920 / shareSize.width, 1920 / shareSize.height);
  const markerWidth = Math.max(1, Math.round(shareSize.width * markerScale));
  const markerHeight = Math.max(1, Math.round(shareSize.height * markerScale));

  return <main className="call-page grid h-dvh min-h-[520px] grid-rows-[72px_minmax(0,1fr)_98px] bg-[#f6f6f2] text-[#2e312c] max-[700px]:grid-rows-[62px_minmax(0,1fr)_112px]">
    <header className="call-header flex items-center border-b border-[#e6e6df] bg-[#fafaf7] px-[34px] max-[700px]:px-4"><a className="brand" href="/">◉ <span>pair</span></a><div className="room-label ml-[34px] max-[700px]:ml-3">ROOM <b>{roomId.slice(0, 8).toUpperCase()}</b></div><div className="ml-auto flex shrink-0 items-center gap-2"><ThemeToggle mobileIconOnly /><button className="invite-button rounded-md border border-[#dedfd7] bg-white px-[14px] py-[10px] text-xs font-semibold text-[#526349] max-[700px]:px-[10px] max-[700px]:py-2" aria-label="Invite someone" title="Invite someone" onClick={copyInvite}>＋ <span className="max-[700px]:hidden">Invite someone</span></button></div></header>
    <section className={`stage ${(sharing || remoteShare) ? `share-layout ${(sharing ? "local" : "remote")}-share ${shareSize.width / shareSize.height < 1 ? "portrait-share" : "landscape-share"}` : ""}`}>
      <div className="video-grid grid min-h-0 grid-cols-2 gap-[15px] max-[700px]:grid-cols-1 max-[700px]:grid-rows-2 max-[700px]:gap-[10px]">
        <article className={`video-card remote-card ${remoteShare ? "share-primary" : ""}`}>
          <video ref={remoteVideo} autoPlay playsInline />
          {!remotePresent && <div className="empty-state"><div className="avatar">＋</div><strong>Waiting for your guest</strong><span>Share the room link to get started</span><button onClick={copyInvite}>Copy invite link</button></div>}
          {remotePresent && !remoteMedia.cameraOn && !remoteShare && <div className="media-state-overlay"><span>▧</span><b>Camera off</b></div>}
          {remotePresent && !remoteMedia.micOn && <div className="media-badge">♩̸ Muted</div>}
          {remoteShare && <canvas ref={canvas} className="marker-canvas" width={markerWidth} height={markerHeight} />}
          <div className="video-name">{remoteName || "Guest"} <i className={remotePresent ? "online" : ""} /></div>
        </article>
        <article className={`video-card local-card ${sharing ? "share-primary sharing-preview" : ""}`}>
          <video ref={localVideo} autoPlay playsInline muted />
          {!cameraOn && !sharing && <div className="camera-off">Camera is off</div>}
          {!micOn && <div className="media-badge self-media-badge">♩̸ Muted</div>}
          {sharing && <canvas ref={canvas} className={`marker-canvas ${markers ? "drawing" : ""}`} width={markerWidth} height={markerHeight} onPointerDown={beginMarker} onPointerMove={moveMarker} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />}
          <div className="video-name">{displayName.trim() || "You"} <i className="online" /></div>
        </article>
      </div>
      {sharing && <div className="share-tools"><span>Screen sharing</span><button className={markers ? "active" : ""} onClick={() => setMarkers(!markers)}>✎ {markers ? "Stop drawing" : "Draw on screen"}</button><button onClick={clearCanvas}>Clear</button><button className={shareAudio ? "active" : ""} onClick={toggleShareAudio}>♫ Share audio {shareAudio ? "On" : "Off"}</button></div>}
      {joinRequest && <div className="permission-backdrop"><section className="permission-card" role="dialog" aria-modal="true" aria-labelledby="join-permission-title"><span className="permission-icon">＋</span><h2 id="join-permission-title">Someone wants to join</h2><p className="permission-name">{joinRequest.name || "Guest"}</p><div className="permission-media"><span>{joinRequest.micOn ? "♩ Mic on" : "♩̸ Mic off"}</span><span>{joinRequest.cameraOn ? "▣ Camera on" : "▧ Camera off"}</span></div><div className="permission-actions"><button className="permission-decline" onClick={() => respondToRequest(false)}>Decline</button><button className="permission-accept" onClick={() => respondToRequest(true)}>Accept</button></div></section></div>}
      {settingsOpen && <aside className="settings-panel"><header><strong>Call settings</strong><button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></header><label className={`settings-toggle ${!isHost ? "settings-disabled" : ""}`}><span><b>Anyone can join</b><small>{isHost ? "Let people enter without approval" : "Only the host can change this"}</small></span><input type="checkbox" checked={anyoneCanJoin} disabled={!isHost} onChange={(event) => updateAnyoneCanJoin(event.target.checked)} /></label><form className="settings-name-form" onSubmit={(event) => { event.preventDefault(); saveDisplayName(); }}><label htmlFor="display-name">Your name</label><div><input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 40))} placeholder="Enter your name" maxLength={40} /><button type="submit">Save</button></div></form></aside>}
      {reaction && <div className="reaction-burst" key={reaction.key}><span>{reaction.emoji}</span><small>{reaction.userId === userId ? (displayName.trim() || "You") : (remoteName || "Guest")}</small></div>}
      <aside className={`chat-panel ${chatOpen ? "panel-open" : "panel-closed"}`} aria-hidden={!chatOpen} inert={!chatOpen}><header><strong>Messages</strong><button onClick={() => setChatOpen(false)}>×</button></header><div className="message-list">{messages.length === 0 && <p className="chat-empty">Say hello to get things going.</p>}{messages.map((message, index) => <div className={`message ${message.userId === userId ? "mine" : "theirs"}`} key={`${message.sentAt}-${index}`}><b>{message.userId === userId ? (displayName.trim() || "You") : (remoteName || "Guest")}</b><span>{message.text}</span></div>)}</div><form onSubmit={sendMessage}><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Write a message…" maxLength={1000} /><button disabled={!chatDraft.trim()}>↑</button></form></aside>
      <div className={`reaction-tray ${reactionsOpen ? "panel-open" : "panel-closed"}`} aria-hidden={!reactionsOpen} inert={!reactionsOpen}>{["❤️", "😂", "👏", "🔥", "🎉"].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}<button className="custom-emoji-button" onClick={() => setCustomEmojiOpen(!customEmojiOpen)}>＋</button>{customEmojiOpen && reactionsOpen && <form onSubmit={(event) => { event.preventDefault(); sendReaction(customEmoji.trim()); setCustomEmoji(""); setCustomEmojiOpen(false); }}><input autoFocus value={customEmoji} onChange={(event) => setCustomEmoji(event.target.value)} placeholder="Paste any emoji" maxLength={12} /><button disabled={!customEmoji.trim()}>Send</button></form>}</div>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {!joined && !notice && <div className="notice">Connecting to your devices…</div>}
    </section>
    <footer className="control-bar grid grid-cols-[1fr_auto_1fr] items-center px-[34px] max-[700px]:grid-cols-1 max-[700px]:px-3"><div className="call-time"><span className="live-dot" />Private call <small>•</small> 2 person limit</div><div className="controls flex items-center gap-[9px] max-[700px]:justify-center max-[700px]:gap-[3px]">
      <button className={`control ${!micOn ? "muted" : ""}`} onClick={() => toggleTrack("audio")} title={micOn ? "Mute microphone" : "Turn on microphone"}>{micOn ? "♩" : "♩̸"}<span>{micOn ? "Mute" : "Unmute"}</span></button>
      <button className={`control ${!cameraOn ? "muted" : ""}`} onClick={() => toggleTrack("video")} title={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? "▣" : "▧"}<span>{cameraOn ? "Stop video" : "Start video"}</span></button>
      {(!isMobileDevice || canCaptureScreen) && <button className={`control screen-control ${sharing ? "selected" : ""}`} onClick={sharing ? stopShare : startShare}>{sharing ? "▣" : "▧"}<span>{sharing ? "Stop sharing" : "Share screen"}</span></button>}
      <button className={`control chat-control ${chatOpen ? "selected" : ""}`} onClick={() => { setChatOpen((open) => !open); setUnreadMessage(false); }} aria-label="Open chat">▤{unreadMessage && !chatOpen && <i className="unread-dot" />}<span>Chat</span></button>
      <button className={`control marker-control ${reactionsOpen ? "selected" : ""}`} onClick={() => setReactionsOpen(!reactionsOpen)}>☺<span>React</span></button>
      <button className={`control settings-control ${settingsOpen ? "selected" : ""}`} onClick={() => setSettingsOpen((open) => !open)} aria-label="Call settings">⚙<span>Settings</span></button>
      <button className="control leave-control" onClick={() => navigate("/")}>↗<span>Leave</span></button>
    </div><div className="call-status">{remotePresent ? <><i className="online" /> Connected</> : <><i /> Waiting</>}</div></footer>
  </main>;
}
