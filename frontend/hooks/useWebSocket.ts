"use client";
import { useEffect, useRef, useCallback } from "react";
import { WS_URL } from "@/lib/api";
import type { WSMessage } from "@/types";

type Handler = (msg: WSMessage) => void;

export function useWebSocket(onMessage: Handler) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mounted.current) return;
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        handlerRef.current(msg);
      } catch {}
    };

    socket.onclose = () => {
      if (mounted.current) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    socket.onerror = () => socket.close();

    // Ping every 25s
    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 25000);

    socket.onclose = () => {
      clearInterval(ping);
      if (mounted.current) reconnectTimer.current = setTimeout(connect, 2000);
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);
}
