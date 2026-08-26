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

  return [hrs, mins, secs]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export default function WatchPlayer({
  title,
  embedUrl,
  html5VideoUrl,
  expiresAtIso,
}: WatchPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const expiry = useMemo(
    () => new Date(expiresAtIso).getTime(),
    [expiresAtIso],
  );

  const [remaining, setRemaining] = useState(() =>
    Math.floor((expiry - Date.now()) / 1000),
  );

  const [showShareMessage, setShowShareMessage] =
    useState(false);

  /*
   * TIMER
   */

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(
        Math.floor((expiry - Date.now()) / 1000),
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [expiry]);

  /*
   * BLOCK COPY / RIGHT CLICK / SHORTCUTS
   */

  useEffect(() => {
    const inPlayer = (target: EventTarget | null) => {
      const node = target as Node | null;

      return !!(
        node &&
        rootRef.current &&
        rootRef.current.contains(node)
      );
    };

    const blockEvent = (event: Event) => {
      if (inPlayer(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const blockKeys = (event: KeyboardEvent) => {
      if (!inPlayer(event.target)) return;

      const key = event.key.toLowerCase();

      const blocked =
        ((event.ctrlKey || event.metaKey) &&
          [
            "c",
            "x",
            "u",
            "s",
            "p",
            "a",
            "i",
            "j",
            "v",
          ].includes(key)) ||
        key === "f12";

      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener(
      "contextmenu",
      blockEvent,
      true,
    );

    document.addEventListener(
      "copy",
      blockEvent,
      true,
    );

    document.addEventListener(
      "cut",
      blockEvent,
      true,
    );

    document.addEventListener(
      "dragstart",
      blockEvent,
      true,
    );

    document.addEventListener(
      "selectstart",
      blockEvent,
      true,
    );

    document.addEventListener(
      "keydown",
      blockKeys,
      true,
    );

    return () => {
      document.removeEventListener(
        "contextmenu",
        blockEvent,
        true,
      );

      document.removeEventListener(
        "copy",
        blockEvent,
        true,
      );

      document.removeEventListener(
        "cut",
        blockEvent,
        true,
      );

      document.removeEventListener(
        "dragstart",
        blockEvent,
        true,
      );

      document.removeEventListener(
        "selectstart",
        blockEvent,
        true,
      );

      document.removeEventListener(
        "keydown",
        blockKeys,
        true,
      );
    };
  }, []);

  /*
   * SHARE BUTTON
   */

  const handleShare = () => {
    setShowShareMessage(true);

    setTimeout(() => {
      setShowShareMessage(false);
    }, 3500);
  };

  /*
   * FULLSCREEN
   */

  const handleFullscreen = async () => {
    if (!playerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen errors
    }
  };

  const isExpired = remaining <= 0;

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* HEADER */}

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {title}
        </h2>

        <p
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            isExpired
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          Remaining Time:{" "}
          {formatSeconds(remaining)}
        </p>
      </div>

      {/* VIDEO */}

      {isExpired ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          Your watching time is over. Please contact
          your teacher for more access time.
        </div>
      ) : (
        <div
          ref={playerRef}
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-black"
        >
          {html5VideoUrl ? (
            /*
             * HTML5 VIDEO
             */

            <video
              className="h-auto w-full"
              src={html5VideoUrl}
              controls
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              disableRemotePlayback
              onContextMenu={(e) =>
                e.preventDefault()
              }
              preload="metadata"
            />
          ) : (
            /*
             * YOUTUBE
             */

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

          {/* CUSTOM BUTTONS */}

          <div className="absolute right-3 top-3 z-20 flex gap-2">
            {/* SHARE */}

            <button
              type="button"
              onClick={handleShare}
              className="rounded-lg bg-black/75 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black"
            >
              ↗ Share
            </button>

            {/* FULLSCREEN */}

            <button
              type="button"
              onClick={handleFullscreen}
              className="rounded-lg bg-black/75 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black"
            >
              ⛶ Fullscreen
            </button>
          </div>

          {/* SHARE MESSAGE */}

          {showShareMessage && (
            <div className="absolute left-1/2 top-1/2 z-30 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/90 p-6 text-center text-white shadow-2xl backdrop-blur">
              <div className="mb-3 text-3xl">
                🔒
              </div>

              <h3 className="mb-2 text-lg font-semibold">
                Sharing Disabled
              </h3>

              <p className="text-sm text-slate-300">
                Sharing or copying this video is not
                allowed from the LMS player.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowShareMessage(false)
                }
                className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Share options, copy actions, right-click menu,
        and direct download functionality are disabled
        in the LMS player.
      </p>
    </section>
  );
}
