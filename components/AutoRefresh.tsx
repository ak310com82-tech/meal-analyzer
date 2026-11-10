"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 支払い完了ページ用：Webhook がまだ届いていないとき、数回だけ自動で読み直す。
 * 回数はこのタブの sessionStorage で数える（無限に再読み込みしない）。
 */
export function AutoRefresh({ storageKey, intervalMs = 8000, maxTries = 6 }: { storageKey: string; intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let tries = 0;
    try {
      tries = Number(window.sessionStorage.getItem(storageKey) || 0);
    } catch {
      /* 使えない環境では毎回 0 から */
    }
    if (tries >= maxTries) {
      setGaveUp(true);
      return;
    }
    const t = setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, String(tries + 1));
      } catch {
        /* noop */
      }
      router.refresh();
    }, intervalMs);
    return () => clearTimeout(t);
  });

  return gaveUp ? (
    <p className="muted small" data-testid="auto-refresh-stopped">
      自動の読み直しを止めました。少し時間をおいて、このページを再読み込みしてください。
    </p>
  ) : (
    <p className="muted small">数秒ごとに自動で読み直しています…</p>
  );
}
