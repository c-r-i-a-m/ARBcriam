"use client";
import { useEffect, useRef } from "react";
import { WS_URL } from "@/lib/api";
import type { WSMessage } from "@/types";

type Handler = (msg: WSMessage) => void;

const CONNECT_DELAY_MS = 0;
const RECONNECT_DELAY_MS = 2000;
const PING_INTERVAL_MS = 25000;

export function useWebSocket(onMessage: Handler) {
  const ws = useRef<WebSocket | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(false);
  const shouldReconnect = useRef(true);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    mounted.current = true;
    shouldReconnect.current = true;

    const clearConnectTimer = () => {
      if (!connectTimer.current) return;
      clearTimeout(connectTimer.current);
      connectTimer.current = null;
    };

    const clearReconnectTimer = () => {
      if (!reconnectTimer.current) return;
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    };

    const clearPingTimer = () => {
      if (!pingTimer.current) return;
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    };

    const cleanupSocket = (socket: WebSocket | null) => {
      if (!socket) return;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN
      ) {
        socket.close();
      }
    };

    const scheduleReconnect = () => {
      if (!mounted.current || !shouldReconnect.current || reconnectTimer.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (!mounted.current || !shouldReconnect.current || ws.current) return;

      clearConnectTimer();
      clearReconnectTimer();

      connectTimer.current = setTimeout(() => {
        connectTimer.current = null;
        if (!mounted.current || !shouldReconnect.current || ws.current) return;

        const socket = new WebSocket(WS_URL);
        ws.current = socket;

        socket.onopen = () => {
          clearPingTimer();
          pingTimer.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send("ping");
            }
          }, PING_INTERVAL_MS);
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as WSMessage;
            handlerRef.current(msg);
          } catch {}
        };

        socket.onerror = () => {
          if (
            socket.readyState === WebSocket.CONNECTING ||
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close();
          }
        };

        socket.onclose = () => {
          if (ws.current === socket) {
            ws.current = null;
          }
          clearPingTimer();
          if (mounted.current && shouldReconnect.current) {
            scheduleReconnect();
          }
        };
      }, CONNECT_DELAY_MS);
    };

    connect();

    return () => {
      mounted.current = false;
      shouldReconnect.current = false;
      clearConnectTimer();
      clearReconnectTimer();
      clearPingTimer();
      const socket = ws.current;
      ws.current = null;
      cleanupSocket(socket);
    };
  }, []);
}
