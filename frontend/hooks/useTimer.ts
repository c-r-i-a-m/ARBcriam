"use client";
import { useEffect, useState } from "react";

interface TimerHookState {
  elapsedMs: number;
  isRunning: boolean;
}

export function useTimer(
  baseElapsedMs: number,
  isRunning: boolean
): number {
  const [elapsed, setElapsed] = useState(baseElapsedMs);

  useEffect(() => {
    if (!isRunning) {
      setElapsed(baseElapsedMs);
      return;
    }

    const localStartMs = Date.now();

    const tick = () => {
      setElapsed(baseElapsedMs + (Date.now() - localStartMs));
    };

    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [baseElapsedMs, isRunning]);

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
