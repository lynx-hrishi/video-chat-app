import { useNavigate } from "react-router-dom";

function BodyOfHome(){
    const navigate = useNavigate();

    async function createRoom(){
        try{            
            const response = await fetch("/api/create-room");
            const data = await response.json();
            console.log({data})
            if (!response.ok) throw new Error(data.message);
            navigate(`/chat-room/${data.roomId}`, {state: { userId: data.userId, role: "creating" }});
        }
        catch(err){
            console.error(err);
        }
    }

    return (
        <>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl font-bold text-center">
                Welcome to Video Chat. <br /> Meet your Online Friends. <br />
                <button onClick={createRoom} className="p-2 align-center border rounded-lg text-white bg-blue-700 text-2xl mt-5 shadow-2xl">Create Room</button>
            </div>

            
        </>
    )
}

export default BodyOfHome;
