import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket from "../components/Websocket/Socket_Connector";
import MicOnIcon from "../components/SVGs/Mic_On";
import MicOfIcon from "../components/SVGs/Mic_Of";
import CameraOnIcon from "../components/SVGs/Camera_On";
import CameraOfIcon from "../components/SVGs/Camera_Of";
import { getLocalStream, getConnectedToIceServers, handleAnswer, handleIceCandidate, handleOffer, handleUserConnected, handleUserDisconnected } from "../services/socketServices";

function ChatRoom() {
    const location = useLocation();
    const navigate = useNavigate();
    const { roomId } = useParams();
    const { role, userId } = location.state || {};
    const localVideo = useRef();
    const remoteVideo = useRef();
    const pc = useRef(null);
    // const localStreamReady = useRef(false);
    const [userStream, setUserStream] = useState();
    const [isRoomOwner, setIsRoomOwner] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);

    // const getLocalStream = async () => await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

    useEffect(() => { 
        (async () => {
            try{
                const stream = await getLocalStream();
                console.log({stream})
                setUserStream(stream);
                pc.current = getConnectedToIceServers({ localStream: stream, remoteVideo, socket, roomId, setIsConnected });
                console.log({pcCurrent: pc.current})
                localVideo.current.srcObject = stream;

                if (role === "creating") {
                    console.log("User has created a meeting");
                    setIsRoomOwner(true);
                    setIsConnected(true);
                    call();
                }

                socket.emit("join-room", roomId, userId);
            }
            catch(err){
                console.error("getUserMedia failed", err);
            }
        })();

        console.log({role, userId, roomId})

        // pc.current.onicecandidateerror = (e) => {
        //     console.log("ICE candidate error:", e);
        // };

        // socket.emit("join-room", roomId, userId);

        // socket.on("user-connected", handleUserConnected);
        // socket.on("offer", handleOffer);
        // socket.on("answer", handleAnswer);
        // socket.on("ice-candidate", handleIceCandidate);
        // socket.on("user-disconnected", handleUserDisconnected);

        return () => {
            if (socket && roomId && userId) {
                socket.emit("disconnect-user", roomId, userId);
            }

            pc.current?.close();
            // socket.off("offer");
            // socket.off("answer");
            // socket.off("ice-candidate");
            // socket.off("user-disconnected");
        };
    }, [roomId, userId]);

    useEffect(() => {
        if (!socket) return;

        socket.on("user-connected",  handleUserConnected);
        socket.on("offer", (offer) => handleOffer({ offer, role, roomId, pc, socket }));
        socket.on("answer", (answer) => handleAnswer({ answer, pc }));
        socket.on("ice-candidate", (candidate) => handleIceCandidate({ candidate, pc }));
        socket.on("user-disconnected", (userId) => handleUserDisconnected({ userId, setUserStream, roomId, pc, setIsConnected, remoteVideo, socket }));

        return () => {
            socket.off("user-connected",  handleUserConnected);
            socket.off("offer", (offer) => handleOffer({ offer, role, roomId, pc, socket }));
            socket.off("answer", (answer) => handleAnswer({ answer, pc }));
            socket.off("ice-candidate", (candidate) => handleIceCandidate({ candidate, pc }));
            socket.off("user-disconnected", (userId) => handleUserDisconnected({ userId, setUserStream, roomId, pc, setIsConnected, remoteVideo, socket }));
        }
    }, [socket]);

    useEffect(() => {
        const handleUnload = () => {
            if (socket && roomId && userId){
                socket.emit("disconnect-user", roomId, userId);
            }
        }
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    }, [socket, roomId, userId]);

    
    
    const call = async () => {
        if (role === "joining") return;
        const offer = await pc.current.createOffer();
        await pc.current.setLocalDescription(offer);
        console.log("Offer created");
        socket.emit("offer", { offer, roomId, userId });
    };

    function handleVideoChange (){
        const track = userStream.getVideoTracks()[0];
        track.enabled = !track.enabled;
        setIsCameraOn(!isCameraOn);
    }

    function handleMicChange (){
        const track = userStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        setIsMicOn(!isMicOn);
    }

  return (
    <>
        <div className="flex flex-col gap-2 p-4">
            <div className="flex gap-2">
                <video ref={localVideo} autoPlay muted className="w-1/2 rounded-xl border" />
                <video ref={remoteVideo} autoPlay className="w-1/2 rounded-xl border" />
            </div>
            
            {!isConnected && (
                <button onClick={call} className="p-2 bg-blue-600 text-white rounded-lg">Start Call</button>
            )}

            {/* <div className="flex fixed gap-10 bottom-0 text-center left-0 w-full bg-gray-800 text-white text-center py-3 shadow-md">
                <div>
                    <MicOnIcon />
                </div>
                <div>
                    <CameraOnIcon />
                </div>
            </div> */}

            <div className="fixed bottom-0 left-0 w-full bg-gray-900 py-3 flex justify-center items-center gap-8 border-t border-gray-700">
                <button onClick={handleMicChange} className="p-2 rounded-full hover:bg-gray-700 transition">
                    {isMicOn && (
                        <MicOnIcon />
                    )}
                    {!isMicOn && (
                        <MicOfIcon />
                    )}
                </button>
                <button onClick={handleVideoChange} className="p-2 rounded-full hover:bg-gray-700 transition">
                    {isCameraOn && (
                        <CameraOnIcon />
                    )}
                    {!isCameraOn && (
                        <CameraOfIcon />
                    )}
                </button>
            </div>

        </div>
    </>
  );
}

export default ChatRoom;