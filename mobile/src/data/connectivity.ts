// Connectivity monitor: NetInfo ("a network exists") + /health ping ("backend reachable").
// Offline -> online triggers a sync. Pauses the ping while the app is in the background.
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { pingHealth } from "./api";
import { requestSync } from "./sync";
import { useAppStore } from "../state/appStore";

let timer: ReturnType<typeof setInterval> | null = null;
let hasNetwork = true;
let started = false;

async function evaluate(): Promise<void> {
  const store = useAppStore.getState();
  const reachable = hasNetwork ? await pingHealth() : false;
  const next = reachable ? "online" : "offline";
  const prev = store.netState;
  if (prev !== next) store.setNetState(next);
  if (next === "online" && (prev === "offline" || store.pendingCount > 0)) requestSync();
}

export function checkNow(): Promise<void> {
  return evaluate();
}

export function startConnectivityMonitor(): void {
  if (started) return;
  started = true;
  NetInfo.addEventListener((s) => {
    const now = s.isConnected !== false;
    if (now !== hasNetwork) {
      hasNetwork = now;
      if (!now) useAppStore.getState().setNetState("offline");
      evaluate();
    }
  });
  const startTimer = () => {
    if (!timer) timer = setInterval(evaluate, 10000);
  };
  AppState.addEventListener("change", (st) => {
    if (st === "active") {
      startTimer();
      evaluate();
    } else if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  startTimer();
  evaluate();
}
