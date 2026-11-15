import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
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
  return <main className="home-page min-h-screen flex flex-col overflow-hidden bg-[#f8f7f3] px-[max(6vw,32px)] text-[#282a25] max-[760px]:px-[22px]">
    <nav className="home-nav flex h-[92px] items-center justify-between border-b border-[#e7e5dd] max-[760px]:h-[74px]"><a className="brand text-[26px] font-extrabold tracking-[-1.4px] text-[#344b3c]" href="/">◉ <span>pair</span></a><span className="nav-note text-[13px] text-[#74766d]">Video calls, made simple.</span><div className="flex items-center gap-4"><a className="nav-link text-[13px] text-[#373a33]" href="#how">How it works <span>↗</span></a><ThemeToggle /></div></nav>
    <section className="hero mx-auto my-auto grid min-h-[560px] w-full max-w-[1180px] grid-cols-2 items-center gap-5 max-[760px]:min-h-0 max-[760px]:grid-cols-1 max-[760px]:py-[42px]"><div className="hero-copy py-[35px] pb-[45px] max-[760px]:p-0"><div className="eyebrow flex items-center gap-[10px] text-[10px] font-bold tracking-[2px] text-[#7e8774]"><i /> PRIVATE BY DESIGN</div><h1 className="my-[27px] mb-[22px] font-[Manrope,sans-serif] text-[clamp(64px,8vw,104px)] font-semibold leading-[.99] tracking-[-7px] text-[#2c302a] max-[760px]:text-[70px] max-[760px]:tracking-[-5px]">Just you.<br/>And your <em className="font-medium text-[#819174]">person.</em></h1><p className="max-w-[430px] text-[15px] leading-[1.8] text-[#77796f]">A calm, simple video space for two. No accounts, no downloads, just a link and a conversation.</p><div className="hero-actions mt-8 flex items-center gap-[22px] max-[760px]:gap-3"><button className="primary-button rounded-[7px] border-0 bg-[#364c3d] px-5 py-[15px] font-semibold text-white shadow-[0_8px_20px_#344b3c24]" onClick={create}>Start a call <span>↗</span></button><div className="join-wrap"><form className="flex border-b border-[#bdbfb3] py-[7px]" onSubmit={join}><input className="w-[155px] border-0 bg-transparent text-xs outline-none max-[760px]:w-[132px]" aria-label="Room ID" placeholder="Have a room code?" value={room} onChange={(e) => setRoom(e.target.value)} /><button className="border-0 bg-transparent text-xl text-[#65765d]" aria-label="Join room">→</button></form>{error && <small>{error}</small>}</div></div><div className="privacy-note mt-[38px] text-[11px] text-[#8d8e85]"><span>◉</span> End-to-end peer connection <b>·</b> Always free</div></div>
      <div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-sun">✳</div><div className="art-card art-back"><span className="art-face face-one">☺</span><div><b>Alex</b><small>here with you</small></div><span className="sound-bars">▂ ▅ ▃ ▆</span></div><div className="art-card art-front"><span className="art-face face-two">✿</span><div><b>You</b><small>looking good</small></div><span className="sound-bars">▃ ▆ ▄ ▇</span></div><span className="sparkle sparkle-a">✳</span><span className="sparkle sparkle-b">✦</span><div className="art-caption">A little room<br/>for the two of you.</div></div></section>
    <section className="home-bottom mx-auto flex w-full max-w-[1180px] items-center justify-between border-t border-[#e7e5dd] py-[31px] pb-[38px] max-[760px]:flex-wrap max-[760px]:gap-[15px]" id="how"><div><span className="step-no">01</span><b>Create your room</b><small>One click, one private link.</small></div><span className="step-arrow">→</span><div><span className="step-no">02</span><b>Send it to someone</b><small>They join in their browser.</small></div><span className="step-arrow">→</span><div><span className="step-no">03</span><b>Be right there</b><small>That's the whole thing.</small></div><span className="home-signoff">Made for the people<br/>you make time for.</span></section>
    <footer className="home-footer"><span>pair © 2026</span><span>Two seats. One conversation.</span></footer>
  </main>;
}
