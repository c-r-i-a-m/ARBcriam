"use client";
import { useState, useEffect, useRef } from "react";

interface TimerHookState {
  elapsedMs: number;
  isRunning: boolean;
}

export function useTimer(
  accumulatedMs: number,
  isRunning: boolean,
  startedAt: string | null
): number {
  const [elapsed, setElapsed] = useState(accumulatedMs);

  useEffect(() => {
    if (!isRunning || !startedAt) {
      setElapsed(accumulatedMs);
      return;
    }

    const startTime = new Date(startedAt + (startedAt.endsWith("Z") ? "" : "Z")).getTime();

    const tick = () => {
      const now = Date.now();
      const delta = now - startTime;
      setElapsed(accumulatedMs + delta);
    };

    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [accumulatedMs, isRunning, startedAt]);

  return elapsed;
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export function formatTimeShort(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}
