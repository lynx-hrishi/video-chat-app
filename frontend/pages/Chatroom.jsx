import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import socket from "../components/Websocket/Socket_Connector";
import "./Chatroom.css";

const identityFor = (roomId) => {
  const key = `peerroom:${roomId}:userId`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
};

export default function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const userId = identityFor(roomId);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const canvas = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const audioContext = useRef(null);
  const markerChannel = useRef(null);
  const pendingCandidates = useRef([]);
  const drawing = useRef(false);
  const hasJoined = useRef(false);
  const mediaState = useRef({ micOn: true, cameraOn: true });
  const [joined, setJoined] = useState(false);
  const [remotePresent, setRemotePresent] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState({ micOn: true, cameraOn: true });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareAudio, setShareAudio] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [remoteMarkers, setRemoteMarkers] = useState(false);
  const [remoteShare, setRemoteShare] = useState(null);
  const [shareSize, setShareSize] = useState({ width: 16, height: 9 });
  const [notice, setNotice] = useState("");

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
        setRemoteMarkers(true);
        if (message.type === "clear") { clearCanvas(false); return; }
        const context = canvas.current?.getContext("2d");
        if (!context) return;
        if (message.type === "start") context.beginPath();
        context.lineWidth = 5; context.lineCap = "round"; context.strokeStyle = "#f5c451";
        if (message.type === "start") context.moveTo(message.x * canvas.current.width, message.y * canvas.current.height);
        if (message.type === "point") { context.lineTo(message.x * canvas.current.width, message.y * canvas.current.height); context.stroke(); }
      };
    };
    const stream = localStream.current;
    if (stream) stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.ontrack = (event) => {
      const incoming = event.streams[0];
      if (remoteVideo.current && incoming) remoteVideo.current.srcObject = incoming;
      setRemotePresent(true);
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
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!active) { localStream.current.getTracks().forEach((track) => track.stop()); return; }
        if (localVideo.current) localVideo.current.srcObject = localStream.current;
        makePeer();
        socket.emit("join-room", roomId, userId);
        socket.emit("media-state", { roomId, userId, ...mediaState.current });
        hasJoined.current = true;
        setJoined(true);
      } catch (error) {
        setNotice(error.name === "NotAllowedError" ? "Allow camera and microphone access to join." : "Could not start your camera and microphone.");
      }
    })();
    const onConnected = ({ userId: peerId, count }) => {
      if (peerId === userId) return;
      setRemotePresent(true);
      setNotice("");
      if (count === 2) createOffer().catch(console.error);
    };
    const onPeerMedia = ({ userId: peerId, micOn: peerMic, cameraOn: peerCamera }) => {
      if (peerId !== userId) setRemoteMedia({ micOn: peerMic, cameraOn: peerCamera });
    };
    const onShareState = ({ userId: peerId, active, width, height }) => {
      if (peerId === userId) return;
      setRemoteShare(active ? { userId: peerId, width, height } : null);
      if (active && width && height) setShareSize({ width, height });
      if (!active) setRemoteMarkers(false);
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
      setRemoteShare(null);
      setRemoteMarkers(false);
      setRemoteMedia({ micOn: true, cameraOn: true });
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
      pendingCandidates.current = [];
      makePeer();
      setNotice("Your guest left. Share the room link to invite them again.");
    };
    const onFull = () => setNotice("This room already has two people.");
    const onSocketReconnect = () => {
      if (!hasJoined.current || !localStream.current) return;
      pendingCandidates.current = [];
      makePeer();
      socket.emit("join-room", roomId, userId);
      socket.emit("media-state", { roomId, userId, ...mediaState.current });
    };
    socket.on("user-connected", onConnected);
    socket.on("peer-media-state", onPeerMedia);
    socket.on("share-state", onShareState);
    socket.on("offer", onOffer);
    socket.on("answer", onAnswer);
    socket.on("ice-candidate", onCandidate);
    socket.on("user-disconnected", onDisconnected);
    socket.on("room-full", onFull);
    socket.on("connect", onSocketReconnect);
    return () => {
      active = false;
      socket.off("user-connected", onConnected);
      socket.off("peer-media-state", onPeerMedia);
      socket.off("share-state", onShareState);
      socket.off("offer", onOffer);
      socket.off("answer", onAnswer);
      socket.off("ice-candidate", onCandidate);
      socket.off("user-disconnected", onDisconnected);
      socket.off("room-full", onFull);
      socket.off("connect", onSocketReconnect);
      hasJoined.current = false;
      socket.emit("disconnect-user", roomId, userId);
      pc.current?.close();
      localStream.current?.getTracks().forEach((track) => track.stop());
      screenStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [roomId, userId, makePeer, createOffer]);

  const toggleTrack = (kind) => {
    const track = localStream.current?.getTracks().find((item) => item.kind === kind);
    if (!track) return;
    track.enabled = !track.enabled;
    if (kind === "audio") { setMicOn(track.enabled); mediaState.current.micOn = track.enabled; }
    else { setCameraOn(track.enabled); mediaState.current.cameraOn = track.enabled; }
    socket.emit("media-state", { roomId, userId, ...mediaState.current });
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
    setSharing(false); setShareAudio(false); setMarkers(false); clearCanvas();
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
      setSharing(true);
    } catch (error) { if (error.name !== "NotAllowedError") setNotice("Screen sharing could not be started."); }
  };

  const toggleShareAudio = () => {
    const track = screenStream.current?.getAudioTracks()[0];
    if (!track) { setNotice("Choose a browser tab or window with audio when starting screen share."); return; }
    track.enabled = !track.enabled;
    setShareAudio(track.enabled);
  };

  const clearCanvas = (announce = true) => {
    const context = canvas.current?.getContext("2d");
    if (context) context.clearRect(0, 0, canvas.current.width, canvas.current.height);
    if (announce && markerChannel.current?.readyState === "open") markerChannel.current.send(JSON.stringify({ type: "clear" }));
  };
  const draw = (event) => {
    if (!drawing.current || !canvas.current) return;
    const bounds = canvas.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * canvas.current.width / bounds.width;
    const y = (event.clientY - bounds.top) * canvas.current.height / bounds.height;
    const context = canvas.current.getContext("2d");
    context.lineWidth = 5; context.lineCap = "round"; context.strokeStyle = "#f5c451";
    context.lineTo(x, y); context.stroke(); context.beginPath(); context.moveTo(x, y);
    if (markerChannel.current?.readyState === "open") markerChannel.current.send(JSON.stringify({ type: "point", x: x / canvas.current.width, y: y / canvas.current.height }));
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${location.origin}/chat-room/${roomId}`);
    setNotice("Invite link copied.");
  };

  return <main className="call-page">
    <header className="call-header"><a className="brand" href="/">◉ <span>pair</span></a><div className="room-label">ROOM <b>{roomId.slice(0, 8).toUpperCase()}</b></div><button className="invite-button" onClick={copyInvite}>＋ <span>Invite someone</span></button></header>
    <section className={`stage ${(sharing || remoteShare) ? `share-layout ${(sharing ? "local" : "remote")}-share ${shareSize.width / shareSize.height < 1 ? "portrait-share" : "landscape-share"}` : ""}`}>
      <div className="video-grid">
        <article className={`video-card remote-card ${remoteShare ? "share-primary" : ""}`}>
          <video ref={remoteVideo} autoPlay playsInline />
          {!remotePresent && <div className="empty-state"><div className="avatar">＋</div><strong>Waiting for your guest</strong><span>Share the room link to get started</span><button onClick={copyInvite}>Copy invite link</button></div>}
          {remotePresent && !remoteMedia.cameraOn && !remoteShare && <div className="media-state-overlay"><span>▧</span><b>Camera off</b></div>}
          {remotePresent && !remoteMedia.micOn && <div className="media-badge">♩̸ Muted</div>}
          {remoteShare && remoteMarkers && <canvas ref={canvas} className="marker-canvas" width="1600" height="900" />}
          <div className="video-name">Guest <i className={remotePresent ? "online" : ""} /></div>
        </article>
        <article className={`video-card local-card ${sharing ? "share-primary sharing-preview" : ""}`}>
          <video ref={localVideo} autoPlay playsInline muted />
          {!cameraOn && !sharing && <div className="camera-off">Camera is off</div>}
          {sharing && markers && <canvas ref={canvas} className="marker-canvas drawing" width="1600" height="900" onPointerDown={(e) => { drawing.current = true; const r = canvas.current.getBoundingClientRect(); markerChannel.current?.readyState === "open" && markerChannel.current.send(JSON.stringify({ type: "start", x: (e.clientX-r.left)/r.width, y: (e.clientY-r.top)/r.height })); draw(e); }} onPointerMove={draw} onPointerUp={() => { drawing.current = false; canvas.current?.getContext("2d")?.beginPath(); }} />}
          <div className="video-name">You <i className="online" /></div>
        </article>
      </div>
      {sharing && <div className="share-tools"><span>Screen sharing</span><button className={markers ? "active" : ""} onClick={() => setMarkers(!markers)}>✎ Mark</button><button onClick={clearCanvas}>Clear</button><button className={shareAudio ? "active" : ""} onClick={toggleShareAudio}>♫ Share audio {shareAudio ? "On" : "Off"}</button></div>}
      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {!joined && !notice && <div className="notice">Connecting to your devices…</div>}
    </section>
    <footer className="control-bar"><div className="call-time"><span className="live-dot" />Private call <small>•</small> 2 person limit</div><div className="controls">
      <button className={`control ${!micOn ? "muted" : ""}`} onClick={() => toggleTrack("audio")} title={micOn ? "Mute microphone" : "Turn on microphone"}>{micOn ? "♩" : "♩̸"}<span>{micOn ? "Mute" : "Unmute"}</span></button>
      <button className={`control ${!cameraOn ? "muted" : ""}`} onClick={() => toggleTrack("video")} title={cameraOn ? "Turn camera off" : "Turn camera on"}>{cameraOn ? "▣" : "▧"}<span>{cameraOn ? "Stop video" : "Start video"}</span></button>
      <button className={`control screen-control ${sharing ? "selected" : ""}`} onClick={sharing ? stopShare : startShare}>{sharing ? "▣" : "▧"}<span>{sharing ? "Stop sharing" : "Share screen"}</span></button>
      <button className="control marker-control" disabled={!sharing} onClick={() => setMarkers(!markers)}>✎<span>Mark</span></button>
      <button className="control leave-control" onClick={() => navigate("/")}>↗<span>Leave</span></button>
    </div><div className="call-status">{remotePresent ? <><i className="online" /> Connected</> : <><i /> Waiting</>}</div></footer>
  </main>;
}
