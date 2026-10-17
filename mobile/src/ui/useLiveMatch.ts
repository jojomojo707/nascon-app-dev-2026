// Realtime trigger for one match over WebSocket (protocol in mobile/architecture/07).
// Messages are triggers, not data: on score/status change we refetch /score.
// The 10 s polling in Match detail stays as the fallback while the socket is down.
import { useEffect, useRef, useState } from "react";
import { getServerUrl } from "../data/settings";
import { getToken } from "../data/session";
import { useAppStore } from "../state/appStore";

export type LiveState = "connected" | "reconnecting" | "off";

export function useLiveMatch(matchId: string, onChange: () => void): LiveState {
  const netState = useAppStore((s) => s.netState);
  const [state, setState] = useState<LiveState>("off");
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (netState !== "online") {
      setState("off");
      return;
    }
    let ws: WebSocket | null = null;
    let closed = false;
    let backoff = 1;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const token = getToken();
      if (!token || closed) return;
      try {
        ws = new WebSocket(`${getServerUrl().replace(/^http/, "ws")}/api/v1/ws?token=${encodeURIComponent(token)}`);
      } catch {
        return retry();
      }
      ws.onopen = () => {
        backoff = 1;
        setState("connected");
        ws?.send(JSON.stringify({ action: "subscribe", match_id: matchId }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string; match_id?: string };
          if (msg.match_id !== matchId) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => cb.current(), 300);
        } catch {
          // ignore malformed messages
        }
      };
      ws.onerror = () => undefined;
      ws.onclose = () => {
        if (!closed) retry();
      };
    };

    const retry = () => {
      setState("reconnecting");
      timer = setTimeout(connect, backoff * 1000);
      backoff = Math.min(backoff * 2, 15);
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (debounce) clearTimeout(debounce);
      try {
        ws?.send(JSON.stringify({ action: "unsubscribe", match_id: matchId }));
      } catch {
        // socket already closed
      }
      ws?.close();
    };
  }, [matchId, netState]);

  return state;
}
