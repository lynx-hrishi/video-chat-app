class ROOM_MAP {
    constructor(){
        this.id;
        this.offer;
        this.createrSocketId
        this.participants = [];
    }

    createRoom(id, offer, createrSocketId, participant){
        this.id = id;
        this.offer = offer;
        this.createrSocketId = createrSocketId;
        this.participants = [...this.participants, participant];
        this.noOfPeoples = this.participants.length;
    }
}

export {
    ROOM_MAP
}