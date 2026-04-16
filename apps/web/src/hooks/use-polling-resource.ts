"use client";

import { startTransition, useCallback, useEffect, useEffectEvent, useState } from "react";

import { apiRequest } from "@/lib/api";

export function usePollingResource<T>(path: string | null, interval = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }

    try {
      const next = await apiRequest<T>(path);
      startTransition(() => {
        setData(next);
        setError(null);
        setLoading(false);
      });
    } catch (err) {
      startTransition(() => {
        setError(err instanceof Error ? err.message : "请求失败");
        setLoading(false);
      });
    }
  }, [path]);

  const poll = useEffectEvent(async () => {
    await refresh();
  });

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (!path) {
      return;
    }

    const timer = window.setInterval(() => {
      void poll();
    }, interval);

    return () => {
      window.clearInterval(timer);
    };
  }, [interval, path, refresh]);

  return { data, loading, error, refresh };
}
