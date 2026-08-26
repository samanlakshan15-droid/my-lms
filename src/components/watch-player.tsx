"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type WatchPlayerProps = {
  title: string;
  accessId: number;
  initialRemainingSeconds: number;
  youtubeVideoId?: string;
  html5VideoUrl?: string;
};

type YouTubePlayer = {
  pauseVideo: () => void;
  getPlayerState: () => number;
};

type YouTubeWindow = Window & typeof globalThis & {
  YT?: {
    Player: new (
      elementId: string,
      options: {
        events?: {
          onStateChange?: (event: { data: number }) => void;
        };
      },
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

function formatSeconds(total: number) {
  const safe = Math.max(0, total);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return [hrs, mins, secs].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function WatchPlayer({
  title,
  accessId,
  initialRemainingSeconds,
  youtubeVideoId,
  html5VideoUrl,
}: WatchPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const html5Ref = useRef<HTMLVideoElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const flushInFlightRef = useRef(false);
  const consumedBufferRef = useRef(0);
  const youtubeTargetId = useId().replace(/:/g, "_");

  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor(initialRemainingSeconds)));
  const [isPlaying, setIsPlaying] = useState(false);

  const isExpired = useMemo(() => remaining <= 0, [remaining]);

  const flushProgress = async () => {
    const buffered = consumedBufferRef.current;
    if (buffered <= 0 || flushInFlightRef.current) return;

    flushInFlightRef.current = true;
    consumedBufferRef.current = 0;

    try {
      await fetch("/api/watch/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, consumedSeconds: buffered }),
        keepalive: true,
      });
    } catch {
      consumedBufferRef.current += buffered;
    } finally {
      flushInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!isPlaying || isExpired) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 0) return 0;
        consumedBufferRef.current += 1;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, isExpired]);

  useEffect(() => {
    if (consumedBufferRef.current >= 5) {
      void flushProgress();
    }
  }, [remaining]);

  useEffect(() => {
    if (!isExpired) return;

    setIsPlaying(false);

    if (html5Ref.current) {
      html5Ref.current.pause();
    }

    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.pauseVideo();
    }

    void flushProgress();
  }, [isExpired]);

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
        (event.ctrlKey || event.metaKey) && ["c", "x", "u", "s", "p", "a", "i", "j", "v"].includes(key);

      if (blocked) {
        event.preventDefault();
      }
    };

    const flushOnHide = () => {
      void flushProgress();
      setIsPlaying(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushOnHide();
      }
    };

    document.addEventListener("contextmenu", blockEvent);
    document.addEventListener("copy", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("dragstart", blockEvent);
    document.addEventListener("selectstart", blockEvent);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("auxclick", blockEvent);
    window.addEventListener("pagehide", flushOnHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("dragstart", blockEvent);
      document.removeEventListener("selectstart", blockEvent);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("auxclick", blockEvent);
      window.removeEventListener("pagehide", flushOnHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void flushProgress();
    };
  }, [accessId]);

  useEffect(() => {
    if (!youtubeVideoId || html5VideoUrl) return;

    const w = window as YouTubeWindow;

    const createPlayer = () => {
      if (!w.YT?.Player) return;

      // Existing Iframe එකට YouTube API එක connect කරනවා
      youtubePlayerRef.current = new w.YT.Player(youtubeTargetId, {
        events: {
          onStateChange: (event) => {
            if (event.data === 1 && !isExpired) {
              setIsPlaying(true); // Playing
            } else if (event.data === 2 || event.data === 0 || event.data === 5) {
              setIsPlaying(false); // Paused or Ended
              void flushProgress();
            }
          },
        },
      });
    };

    if (w.YT?.Player) {
      createPlayer();
      return;
    }

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');

    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.body.appendChild(script);
    }

    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      createPlayer();
    };
  }, [youtubeVideoId, html5VideoUrl, youtubeTargetId, isExpired]);

  const requestFullscreen = async () => {
    if (!playerShellRef.current) return;
    try {
      await playerShellRef.current.requestFullscreen();
    } catch {
      // ignore fullscreen rejection
    }
  };

  // YouTube embed URL එක හදනවා parameters එක්ක (enablejsapi=1 අනිවාර්යයි API එක වැඩ කරන්න)
  const youtubeOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const youtubeEmbedUrl = youtubeVideoId 
    ? `https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1&rel=0&modestbranding=1&controls=1&disablekb=1&playsinline=1&fs=1&origin=${youtubeOrigin}`
    : '';

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onAuxClick={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button === 2) e.preventDefault();
      }}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className={`rounded-full px-3 py-1 text-sm font-semibold ${isExpired ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          Remaining Time: {formatSeconds(remaining)}
        </p>
      </div>

      {!isExpired ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={requestFullscreen}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            Fullscreen
          </button>
        </div>
      ) : null}

      {isExpired ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          Your watching time is over. Please contact your teacher for more access time.
        </div>
      ) : (
        <div ref={playerShellRef} className="video-shell relative overflow-hidden rounded-xl border border-slate-200 bg-black">
  {/* Bottom Left එකේ තියෙන Share / YouTube Logo Block කරන Transparent Cover එක */}
  <div 
    className="absolute bottom-0 left-0 w-48 h-16 z-10 bg-transparent"
    onContextMenu={(e) => e.preventDefault()}
    onMouseDown={(e) => e.preventDefault()}
  />

  {html5VideoUrl ? (
    <video
      ref={html5Ref}
      className="h-auto w-full"
      src={html5VideoUrl}
      controls
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      onPlay={() => setIsPlaying(true)}
      onPause={() => {
        setIsPlaying(false);
        void flushProgress();
      }}
      onEnded={() => {
        setIsPlaying(false);
        void flushProgress();
      }}
      onContextMenu={(e) => e.preventDefault()}
      preload="metadata"
    />
  ) : (
    <iframe
      id={youtubeTargetId}
      className="aspect-video w-full"
      src={youtubeEmbedUrl}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-presentation"
    />
  )}
</div>
      )}

      <p className="text-xs text-slate-500">
        Timer counts down only while video playback is active. Pausing or stopping the video pauses the timer.
      </p>
    </section>
  );
}
