import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function Home() {
  const [room, setRoom] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const create = async () => {
    try {
      const response = await fetch("/api/create-room");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create a room");
      navigate(`/chat-room/${data.roomId}`);
    } catch { setError("Could not reach the server. Please try again."); }
  };
  const join = async (event) => {
    event.preventDefault();
    const roomId = room.trim();
    if (!roomId) return setError("Enter a room ID to continue.");
    try {
      const response = await fetch(`/api/get-user-id/${encodeURIComponent(roomId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Room not found");
      setError(""); navigate(`/chat-room/${roomId}`);
    } catch (e) { setError(e.message || "Could not reach the server."); }
  };
  return <main className="home-page">
    <nav className="home-nav"><a className="brand" href="/">◉ <span>pair</span></a><span className="nav-note">Video calls, made simple.</span><a className="nav-link" href="#how">How it works <span>↗</span></a></nav>
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><i /> PRIVATE BY DESIGN</div><h1>Just you.<br/>And your <em>person.</em></h1><p>A calm, simple video space for two. No accounts, no downloads, just a link and a conversation.</p><div className="hero-actions"><button className="primary-button" onClick={create}>Start a call <span>↗</span></button><div className="join-wrap"><form onSubmit={join}><input aria-label="Room ID" placeholder="Have a room code?" value={room} onChange={(e) => setRoom(e.target.value)} /><button aria-label="Join room">→</button></form>{error && <small>{error}</small>}</div></div><div className="privacy-note"><span>◉</span> End-to-end peer connection <b>·</b> Always free</div></div>
      <div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-sun">✳</div><div className="art-card art-back"><span className="art-face face-one">☺</span><div><b>Alex</b><small>here with you</small></div><span className="sound-bars">▂ ▅ ▃ ▆</span></div><div className="art-card art-front"><span className="art-face face-two">✿</span><div><b>You</b><small>looking good</small></div><span className="sound-bars">▃ ▆ ▄ ▇</span></div><span className="sparkle sparkle-a">✳</span><span className="sparkle sparkle-b">✦</span><div className="art-caption">A little room<br/>for the two of you.</div></div></section>
    <section className="home-bottom" id="how"><div><span className="step-no">01</span><b>Create your room</b><small>One click, one private link.</small></div><span className="step-arrow">→</span><div><span className="step-no">02</span><b>Send it to someone</b><small>They join in their browser.</small></div><span className="step-arrow">→</span><div><span className="step-no">03</span><b>Be right there</b><small>That's the whole thing.</small></div><span className="home-signoff">Made for the people<br/>you make time for.</span></section>
    <footer className="home-footer"><span>pair © 2026</span><span>Two seats. One conversation.</span></footer>
  </main>;
}
