const getLocalStream = async () => {
    // if (localStreamReady.current) return Promise.resolve();
    //     return new Promise(resolve => {
    //         const id = setInterval(() => {
    //         if (localStreamReady.current) {
    //             clearInterval(id);
    //             resolve();
    //         }
    //         }, 50);
    //     });
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    };

function getConnectedToIceServers({ localStream, remoteVideo, socket, roomId, setIsConnected }) {
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
        if (e.candidate) socket.emit("ice-candidate", { roomId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
        remoteVideo.current.srcObject = e.streams[0];
    };

    pc.onconnectionstatechange = () => {
        // console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === "connected") setIsConnected(true);
    };

    pc.oniceconnectionstatechange = () => {
        // console.log("ICE state:", pc.iceConnectionState);
    };

    pc.onicegatheringstatechange = () => {
        // console.log("ICE gathering state:", pc.iceGatheringState);
    };
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    return pc;
}

const handleUserConnected = (userId) => {
    // console.log(`User Connected: ${userId}`);
}

const handleOffer = async ({ offer, role, roomId, pc, socket }) => {
    if (role === 'creating') return;
    // console.log("Offer Recieved");
    // await waitForLocalStream();
    await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);
    socket.emit("answer", { answer, roomId });
}

const handleAnswer = async ({ answer, pc}) => {
    // console.log("answer rec", { answer });
    await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
}

const handleIceCandidate = async ({ candidate, pc }) => {
    try {
        await pc.current.addIceCandidate(candidate);
        // socket.emit("ice-candidate", { candidate, roomId })
    } catch (err) {
        console.error("Error adding ICE candidate", err);
    }
}

const handleUserDisconnected = async ({ userId, setUserStream, roomId, pc, setIsConnected, socket, remoteVideo }) => {
    // console.log("user disconnected", userId);

    if (pc.current) {
        pc.current.onicecandidate = null;
        pc.current.ontrack = null;
        pc.current.onicegatheringstatechange = null;
        pc.current.onconnectionstatechange = null;
        pc.current.oniceconnectionstatechange = null;
        pc.current.close();
        pc.current = null;
    }
    await new Promise(r => setTimeout(r, 100));

    const stream = await getLocalStream();
    setUserStream(stream);
    pc.current = getConnectedToIceServers({ localStream: stream, remoteVideo, socket, roomId, setIsConnected });
    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);
    // console.log("New Offer created");
    socket.emit("update-offer", { offer, roomId });
    // console.log("creating new connection", { pccur: pc.current })


    if (remoteVideo.current?.srcObject) {
        remoteVideo.current.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.current.srcObject = null;
    }
    setIsConnected(false);
}

export {
    getLocalStream,
    getConnectedToIceServers,
    handleUserConnected,
    handleAnswer,
    handleIceCandidate,
    handleOffer,
    handleUserDisconnected
}