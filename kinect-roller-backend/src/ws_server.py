"""Broadcast-only WebSocket server: pushes roller detection updates (JSON)
to every connected client. Runs its own asyncio event loop in a background
thread so the main thread stays free for the Kinect capture / OpenCV debug
loop.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Optional, Set

import websockets
from websockets.server import WebSocketServerProtocol

logger = logging.getLogger("ws_server")


class RollerWebSocketServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self._clients: Set[WebSocketServerProtocol] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._server = None
        self._ready = threading.Event()

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._ready.wait(timeout=5.0)

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self) -> None:
        self._server = await websockets.serve(self._handle_client, self.host, self.port)
        logger.info("WebSocket server listening on ws://%s:%d", self.host, self.port)
        self._ready.set()
        await self._server.wait_closed()

    async def _handle_client(self, websocket: WebSocketServerProtocol) -> None:
        self._clients.add(websocket)
        logger.info("Client connected (%d total)", len(self._clients))
        try:
            async for _ in websocket:
                pass  # this server only pushes; ignore anything clients send
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            logger.info("Client disconnected (%d total)", len(self._clients))

    def broadcast(self, payload: dict) -> None:
        if self._loop is None or not self._clients:
            return
        message = json.dumps(payload)
        asyncio.run_coroutine_threadsafe(self._broadcast_async(message), self._loop)

    async def _broadcast_async(self, message: str) -> None:
        stale = []
        for client in list(self._clients):
            try:
                await client.send(message)
            except websockets.ConnectionClosed:
                stale.append(client)
        for client in stale:
            self._clients.discard(client)

    def stop(self) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._shutdown(), self._loop)
        if self._thread is not None:
            self._thread.join(timeout=3.0)

    async def _shutdown(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
        self._loop.stop()
