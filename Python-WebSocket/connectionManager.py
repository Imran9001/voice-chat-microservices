from typing import Dict,List
from fastapi import WebSocket
import json

class connection_manager:
    def __init__(self):
        self.rooms: Dict[str,List[WebSocket]] = {}  # List of rooms

    def room_Name(self, user1:str, user2:str):
        return "_" .join(sorted([user1,user2]))

    async def connect(self, websocket:WebSocket, username:str, partner:str):
        await websocket.accept()
        room = self.room_Name(username,partner)
        if room not in self.rooms:
            self.rooms[room] = []
        self.rooms[room].append(websocket)
        print (f"{username} joined room {room}") 

    async def disconnect(self, username:str, websocket:WebSocket):
        for room, sockets in list (self.rooms.items()):
            if websocket in sockets:
                sockets.remove(websocket)
                print(f"{username} left room {room}")
                if not sockets:
                    del self.rooms[room]
                break

    async def send_room_message(self, message: str, sender: str, receiver: str):
        room = self.room_Name(sender, receiver)
        sockets = self.rooms.get(room, [])
        
        # 1. Create a Dictionary (The data package)
        response_data = {
            "sender": sender,
            "content": message
        }
        
        # 2. Convert to JSON String
        json_response = json.dumps(response_data)

        dead_sockets = []

        # 3. Send the JSON string to everyone in the room
        for ws in sockets:
            try:
                await ws.send_text(json_response)
            except RuntimeError:
                dead_sockets.append(ws)
        
        for ws in dead_sockets:
            sockets.remove(ws)
    