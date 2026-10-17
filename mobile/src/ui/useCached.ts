// Standard screen state (mobile/architecture/05): cached rows from SQLite + network refresh.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "../core/errors";
import { cacheGet } from "../data/db";
import { ApiResult } from "../data/api";
import { useAppStore } from "../state/appStore";

export type ScreenState<T> = {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: AppError | null;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
};

/**
 * Reads `key` from the SQLite cache (re-reads whenever local data changes) and refreshes it
 * from the server on mount and on demand. Offline, the cached copy is shown.
 */
export function useCached<T>(key: string | null, fetcher: (() => Promise<ApiResult<T>>) | null, pollMs?: number): ScreenState<T> {
  const dataVersion = useAppStore((s) => s.dataVersion);
  const netState = useAppStore((s) => s.netState);
  const [isRefreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempted, setAttempted] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = key ? cacheGet<T>(key) : null;
  // dataVersion is read so React re-runs this when SQLite changes.
  void dataVersion;

  const refresh = useCallback(async () => {
    const f = fetcherRef.current;
    if (!f) return;
    setRefreshing(true);
    const res = await f();
    setRefreshing(false);
    setAttempted(true);
    setError(res.ok ? null : res.error);
  }, []);

  useEffect(() => {
    if (key) refresh();
  }, [key, refresh]);

  // Refetch when the backend comes back.
  useEffect(() => {
    if (key && netState === "online" && error?.kind === "offline") refresh();
  }, [netState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pollMs || !key) return;
    const t = setInterval(() => {
      if (useAppStore.getState().netState === "online") refresh();
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, key, refresh]);

  return {
    data: entry ? entry.data : null,
    isLoading: !entry && !attempted && key !== null,
    isRefreshing,
    error,
    lastUpdated: entry ? entry.fetchedAt : null,
    refresh,
  };
}
