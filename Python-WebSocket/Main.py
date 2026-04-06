from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from connectionManager import connection_manager
from auth import verify_jwt

app = FastAPI()
manager = connection_manager()

@app.websocket("/ws")
async def websocket_endpoint(websocket:WebSocket):
    token = websocket.query_params.get("token")
    receiver = websocket.query_params.get("receiver")

    if not receiver:
        await websocket.close(code = 4400)
        return
    
    try:
        payload = verify_jwt(token)
        sender = payload.get("username")
    except Exception as e:
        await websocket.close (code = 4401)
        return 
    
    await manager.connect (websocket,sender,receiver)
    print(f"{sender} opened chat with {receiver}")

    try:
        while True:
            message = await websocket.receive_text()
            await manager.send_room_message(message,sender,receiver)
    except WebSocketDisconnect:
        await manager.disconnect(sender,websocket)
        print(f"{sender} disconnected")

    


    
