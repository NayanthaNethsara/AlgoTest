"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";

type AsyncDataState<T> = {
  data: T;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

/**
 * Loads data on mount (and whenever `loader` changes, so callers wrap it in
 * `useCallback` with their real dependencies) and exposes a refresh that keeps
 * the previous data on screen, so a manual or post-mutation reload never flashes
 * the page back to a skeleton. Responses from a superseded request are dropped.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  initialData: T,
  fallbackMessage?: string
): AsyncDataState<T> {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (isRefresh: boolean) => {
      const id = ++requestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await loader();
        if (!mounted.current || id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted.current || id !== requestId.current) return;
        setError(getErrorMessage(err, fallbackMessage));
      } finally {
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loader, fallbackMessage]
  );

  useEffect(() => {
    void run(false);
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, error, loading, refreshing, refresh };
}
