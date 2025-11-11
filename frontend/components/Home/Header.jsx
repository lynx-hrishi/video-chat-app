import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function Header(){
    const navigate = useNavigate();
    const [joinRoomBox, setJoinRoomBox] = useState(false);
    const [roomId, setRoomId] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    async function joinRoom(){
        try{
            const response = await fetch(`/api/get-user-id/${roomId}`);
            const data = await response.json();
            console.log({data})
            if (!response.ok) throw new Error(data.message);
            setErrorMsg("");
            navigate(`/chat-room/${roomId}`, {state: { userId: data.userId, role: "joining" }});
        }
        catch(err){
            console.error(err);
            setErrorMsg(err.message);
        }
    }

    return (
        <>
            <div className="text-4xl font-bold bg-blue-700 text-white p-3 flex justify-between">
                Video Chat
                <ul className="text-xl mt-1 border-inherit p-2 shadow-2xl rounded-lg bg-blue-600 hover-shadow-black cursor-pointer">
                    <li onClick={() => setJoinRoomBox(!joinRoomBox)}>Join Room</li>
                </ul>
            </div>

            {joinRoomBox && (
                <>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold pl-10 pr-10 border bg-blue-700 rounded-lg z-1 text-center">
                        <h3 className="text-white">Enter Room Id:</h3>
                        <input className="mt-2" type="text" onChange={(e) => setRoomId(e.target.value)} /> <br />
                        {errorMsg && (
                            <span className="text-xl border-inherit shadow-2xl rounded-lg text-red-600 bg-inherit">{errorMsg}</span>
                        )} <br />
                        <button onClick={joinRoom} className="p-2 border  mb-3 rounded-lg text-white bg-blue-600 hover:bg-black-400 cursor-pointer">Join</button>
                    </div>
                </>
            )}
        </>
    )
}

export default Header;