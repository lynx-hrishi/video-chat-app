import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket from "../components/Websocket/Socket_Connector";
import MicOnIcon from "../components/SVGs/Mic_On";
import MicOfIcon from "../components/SVGs/Mic_Of";
import CameraOnIcon from "../components/SVGs/Camera_On";
import CameraOfIcon from "../components/SVGs/Camera_Of";

function ChatRoom() {
    const location = useLocation();
    const navigate = useNavigate();
    const { roomId } = useParams();
    const { role, userId } = location.state || {};
    const localVideo = useRef();
    const remoteVideo = useRef();
    const pc = useRef(null);
    const localStreamReady = useRef(false);
    const [userStream, setUserStream] = useState();
    const [isRoomOwner, setIsRoomOwner] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(true);

    function getConnectedToIceServers(localStream) {
        const config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                urls: "turn:relay1.expressturn.com:3478",
                username: "efgh",
                credential: "ijkl"
                }
            ]
        };
        const pc = new RTCPeerConnection(config);

        // pc.onicecandidate = e => {
        //     if (e.candidate)
        //     socket.emit("ice-candidate", { roomId, candidate: e.candidate });
        // };

        pc.ontrack = e => {
            remoteVideo.current.srcObject = e.streams[0];
        };

        pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("ice-candidate", {roomId, candidate: e.candidate});
        };

        pc.ontrack = (e) => {
            remoteVideo.current.srcObject = e.streams[0];
        };

        pc.onconnectionstatechange = () => {
            console.log("Connection state:", pc.connectionState);
            if (pc.connectionState === "connected") setIsConnected(true);
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE state:", pc.iceConnectionState);
        };

        pc.onicegatheringstatechange = () => {
            console.log("ICE gathering state:", pc.iceGatheringState);
        };
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        return pc;
    }

    useEffect(() => { 
        (async () => {
            try{
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setUserStream(stream);
                pc.current = getConnectedToIceServers(stream);
                console.log(pc.current)
                // stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
                localStreamReady.current = true;
                localVideo.current.srcObject = stream;
                // console.log("local media ready, senders:", pc.current.getSenders());

                if (role === "creating") {
                    console.log("User has created a meeting");
                    setIsRoomOwner(true);
                    setIsConnected(true);
                    call();
                }
            }
            catch(err){
                console.error("getUserMedia failed", err);
            }
        })();


        // pc.current.onicecandidateerror = (e) => {
        //     console.log("ICE candidate error:", e);
        // };

        socket.emit("join-room", roomId, userId);
        socket.on("user-connected", userId => {
            console.log(`User Connected: ${userId}`);
        })

        socket.on("offer", async (offer) => {
            console.log("Offer Recieved")
            await waitForLocalStream();
            await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            socket.emit("answer", { answer, roomId });
        });

        socket.on("answer", async (answer) => {
            console.log("answer rec", {answer});
            await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("ice-candidate", async (candidate) => {
            try {
                await pc.current.addIceCandidate(candidate);
                // socket.emit("ice-candidate", { candidate, roomId })
            } catch (err) {
                console.error("Error adding ICE candidate", err);
            }
        });

        socket.on("user-disconnected", async (userId) => {
            console.log("user disconnected", userId);

            if (pc.current){
                pc.current.onicecandidate = null;
                pc.current.ontrack = null;
                pc.current.onicegatheringstatechange = null;
                pc.current.onconnectionstatechange = null;
                pc.current.oniceconnectionstatechange = null;
                pc.current.close();
                pc.current = null;
            }
            await new Promise(r => setTimeout(r, 100));

            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // setUserStream(stream);
            pc.current = getConnectedToIceServers(stream);
            const offer = await pc.current.createOffer();
            await pc.current.setLocalDescription(offer);
            console.log("New Offer created");
            socket.emit("update-offer", { offer, roomId });
            console.log("creating new connection", {pccur: pc.current})


            if (remoteVideo.current?.srcObject){
                remoteVideo.current.srcObject.getTracks().forEach(track => track.stop());
                remoteVideo.current.srcObject = null;
            }
            setIsConnected(false);
        });

        return () => {
            if (socket && roomId && userId) {
                socket.emit("disconnect-user", roomId, userId);
            }

            pc.current?.close();
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
            socket.off("user-disconnected");
        };
    }, [setIsConnected]);

    useEffect(() => {
        const handleUnload = () => {
            if (socket && roomId && userId){
                socket.emit("disconnect-user", roomId, userId);
            }
        }
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    }, [socket, roomId, userId]);

    const waitForLocalStream = () => {
    if (localStreamReady.current) return Promise.resolve();
        return new Promise(resolve => {
            const id = setInterval(() => {
            if (localStreamReady.current) {
                clearInterval(id);
                resolve();
            }
            }, 50);
        });
    };
    
    const call = async () => {
        if (role === "joining") return;
        const offer = await pc.current.createOffer();
        await pc.current.setLocalDescription(offer);
        console.log("Offer created");
        socket.emit("offer", { offer, roomId });
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