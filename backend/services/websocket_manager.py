from fastapi import WebSocket, WebSocketDisconnect, APIRouter
from typing import List, Dict, Any
import json
import asyncio

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        data = json.dumps(message, default=str)
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                dead.append(connection)
        for c in dead:
            self.disconnect(c)

    async def send_personal(self, websocket: WebSocket, message: Dict[str, Any]):
        await websocket.send_text(json.dumps(message, default=str))


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep alive / receive pings
            data = await websocket.receive_text()
            if data == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
