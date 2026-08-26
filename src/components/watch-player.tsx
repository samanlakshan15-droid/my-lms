"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WatchPlayerProps = {
  title: string;
  embedUrl?: string;
  html5VideoUrl?: string;
  expiresAtIso: string;
};

function formatSeconds(total: number) {
  const safe = Math.max(0, total);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return [hrs, mins, secs].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function WatchPlayer({ title, embedUrl, html5VideoUrl, expiresAtIso }: WatchPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const expiry = useMemo(() => new Date(expiresAtIso).getTime(), [expiresAtIso]);
  const [remaining, setRemaining] = useState(() => Math.floor((expiry - Date.now()) / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.floor((expiry - Date.now()) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiry]);

  useEffect(() => {
    const inPlayer = (target: EventTarget | null) => {
      const node = target as Node | null;
      return !!(node && rootRef.current && rootRef.current.contains(node));
    };

    const blockEvent = (event: Event) => {
      if (inPlayer(event.target)) {
        event.preventDefault();
      }
    };

    const blockKeys = (event: KeyboardEvent) => {
      if (!inPlayer(event.target)) return;

      const key = event.key.toLowerCase();
      const blocked =
        (event.ctrlKey || event.metaKey) && ["c", "x", "u", "s", "p", "a"].includes(key);

      if (blocked) {
        event.preventDefault();
      }
    };

    document.addEventListener("contextmenu", blockEvent);
    document.addEventListener("copy", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("dragstart", blockEvent);
    document.addEventListener("selectstart", blockEvent);
    document.addEventListener("keydown", blockKeys);

    return () => {
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("dragstart", blockEvent);
      document.removeEventListener("selectstart", blockEvent);
      document.removeEventListener("keydown", blockKeys);
    };
  }, []);

  const isExpired = remaining <= 0;

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className={`rounded-full px-3 py-1 text-sm font-semibold ${isExpired ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          Remaining Time: {formatSeconds(remaining)}
        </p>
      </div>

      {isExpired ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          Your watching time is over. Please contact your teacher for more access time.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
          {html5VideoUrl ? (
            <video
              className="h-auto w-full"
              src={html5VideoUrl}
              controls
              controlsList="nodownload noplaybackrate"
              onContextMenu={(e) => e.preventDefault()}
              preload="metadata"
            />
          ) : (
            <iframe
              width="100%"
              height="520"
              src={embedUrl ?? ""}
              title={title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen={true}
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Share options, copy actions, right-click menu, and direct download functionality are disabled in the LMS player.
      </p>
    </section>
  );
}
