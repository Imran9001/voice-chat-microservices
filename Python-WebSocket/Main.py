from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware # Added for SSL/Domain support
from connectionManager import connection_manager
from auth import verify_jwt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://voicechat.it.com", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = connection_manager()

# PATH LOGIC: Changed to "/"
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    receiver = websocket.query_params.get("receiver")

    if not receiver:
        # Closing with a custom code if receiver is missing
        await websocket.close(code=4400)
        return
    
    try:
        payload = verify_jwt(token)
        sender = payload.get("username")
    except Exception as e:
        print(f"Auth failed: {e}")
        await websocket.close(code=4401)
        return 
    
    await manager.connect(websocket, sender, receiver)
    print(f"{sender} opened chat with {receiver}")

    try:
        while True:
            message = await websocket.receive_text()
            await manager.send_room_message(message, sender, receiver)
    except WebSocketDisconnect:
        await manager.disconnect(sender, websocket)
        print(f"{sender} disconnected")

    


    
