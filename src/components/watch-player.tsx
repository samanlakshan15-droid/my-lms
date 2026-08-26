"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type WatchPlayerProps = {
  title: string;
  accessId: number;
  initialRemainingSeconds: number;
  youtubeVideoId?: string;
  html5VideoUrl?: string;
};

type YouTubePlayerState = -1 | 0 | 1 | 2 | 3 | 5;

type YouTubePlayer = {
  pauseVideo: () => void;
  playVideo: () => void;
  getPlayerState: () => YouTubePlayerState;
  setPlaybackRate: (rate: number) => void;
  getAvailablePlaybackRates: () => number[];
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeWindow = Window & typeof globalThis & {
  YT?: {
    Player: new (
      elementId: string,
      options: {
        videoId: string;
        width: string;
        height: string;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: YouTubePlayerState }) => void;
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
  const youtubeMountRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const flushInFlightRef = useRef(false);
  const consumedBufferRef = useRef(0);
  const youtubeTargetId = useId().replace(/:/g, "_");

  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor(initialRemainingSeconds)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [skipSeconds, setSkipSeconds] = useState(10);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [availableRates, setAvailableRates] = useState<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);

  const isExpired = useMemo(() => remaining <= 0, [remaining]);
  const isYouTubeMode = Boolean(youtubeVideoId && !html5VideoUrl);

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

  const setRate = (rate: number) => {
    if (!Number.isFinite(rate)) return;

    if (html5Ref.current) {
      html5Ref.current.playbackRate = rate;
    }

    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.setPlaybackRate(rate);
      } catch {
        // ignore invalid rate errors
      }
    }

    setPlaybackRate(rate);
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
    if (!isYouTubeMode || !youtubePlayerRef.current) return;

    const sync = () => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime() || 0);
      setTotalTime(player.getDuration() || 0);
    };

    sync();
    const interval = setInterval(sync, 500);
    return () => clearInterval(interval);
  }, [isYouTubeMode, isPlaying, youtubeReady]);

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

    const hardenYouTubeIframe = () => {
      const iframe = youtubeMountRef.current?.querySelector("iframe");
      if (!iframe) return;
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
      iframe.setAttribute("tabindex", "-1");
      iframe.style.pointerEvents = "none";
    };

    const createPlayer = () => {
      if (!w.YT?.Player) return;

      youtubePlayerRef.current = new w.YT.Player(youtubeTargetId, {
        videoId: youtubeVideoId,
        width: "100%",
        height: "520",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            setYoutubeReady(true);
            hardenYouTubeIframe();

            const rates = youtubePlayerRef.current?.getAvailablePlaybackRates() ?? [1];
            const unique = Array.from(new Set(rates)).sort((a, b) => a - b);
            setAvailableRates(unique.length > 0 ? unique : [1]);
            setRate(1);
          },
          onStateChange: (event) => {
            if (event.data === 1 && !isExpired) {
              setIsPlaying(true);
            } else if (event.data === 2 || event.data === 0 || event.data === 5 || event.data === -1) {
              setIsPlaying(false);
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

  useEffect(() => {
    if (!html5VideoUrl) return;

    const defaults = [0.5, 0.75, 1, 1.25, 1.5, 2];
    setAvailableRates(defaults);
    setTimeout(() => setRate(1), 0);
  }, [html5VideoUrl]);

  const requestFullscreen = async () => {
    const shell = playerShellRef.current;
    if (!shell) return;

    try {
      if (html5Ref.current) {
        const video = html5Ref.current as HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitRequestFullscreen?: () => Promise<void> | void;
        };

        if (video.requestFullscreen) {
          await video.requestFullscreen();
          return;
        }

        if (video.webkitRequestFullscreen) {
          await video.webkitRequestFullscreen();
          return;
        }

        if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
          return;
        }
      }

      if (shell.requestFullscreen) {
        await shell.requestFullscreen();
        return;
      }

      const legacyShell = shell as HTMLDivElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };

      if (legacyShell.webkitRequestFullscreen) {
        await legacyShell.webkitRequestFullscreen();
      }
    } catch {
      // ignore fullscreen rejection
    }
  };

  const togglePlayback = () => {
    if (isExpired) return;

    if (isYouTubeMode) {
      const player = youtubePlayerRef.current;
      if (!player) return;

      const state = player.getPlayerState();
      if (state === 1) {
        player.pauseVideo();
        setIsPlaying(false);
        void flushProgress();
      } else {
        player.playVideo();
        setIsPlaying(true);
      }
      return;
    }

    const video = html5Ref.current;
    if (!video) return;

    if (video.paused) {
      void video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
      void flushProgress();
    }
  };

  const skipBy = (direction: "back" | "forward") => {
    if (isExpired) return;

    const amount = Number.isFinite(skipSeconds) ? Math.max(1, Math.floor(skipSeconds)) : 10;
    const delta = direction === "forward" ? amount : -amount;

    if (isYouTubeMode) {
      const player = youtubePlayerRef.current;
      if (!player) return;

      const current = player.getCurrentTime();
      const duration = player.getDuration();
      const next = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, current + delta));
      player.seekTo(next, true);
      setCurrentTime(next);
      setTotalTime(duration || 0);
      return;
    }

    const video = html5Ref.current;
    if (!video) return;

    const next = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER, video.currentTime + delta));
    video.currentTime = next;
    setCurrentTime(next);
    setTotalTime(Number.isFinite(video.duration) ? video.duration : 0);
  };

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
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            disabled={isYouTubeMode ? !youtubeReady : false}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <span className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
            {formatSeconds(Math.floor(currentTime))} / {formatSeconds(Math.floor(totalTime))}
          </span>

          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1">
            <input
              type="number"
              min={1}
              value={skipSeconds}
              onChange={(e) => setSkipSeconds(Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1))}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
            />
            <span className="text-xs font-semibold text-slate-600">sec</span>
            <button
              type="button"
              onClick={() => skipBy("back")}
              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
            >
              - Skip
            </button>
            <button
              type="button"
              onClick={() => skipBy("forward")}
              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white"
            >
              + Skip
            </button>
          </div>

          <select
            value={playbackRate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900"
          >
            {availableRates.map((rate) => (
              <option key={rate} value={rate}>
                Speed {rate}x
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={requestFullscreen}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
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
        <div
          ref={playerShellRef}
          className="video-shell overflow-hidden rounded-xl border border-slate-200 bg-black"
          onContextMenu={(e) => e.preventDefault()}
        >
          {html5VideoUrl ? (
            <video
              ref={html5Ref}
              className="h-auto w-full"
              src={html5VideoUrl}
              controls={false}
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              onLoadedMetadata={(e) => {
                setTotalTime(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
              }}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime);
              }}
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
            <div ref={youtubeMountRef} className="relative">
              <div id={youtubeTargetId} className="aspect-video w-full" />
              <div
                aria-hidden
                className="absolute inset-0 z-10 bg-transparent"
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onMouseUp={(e) => e.preventDefault()}
                onAuxClick={(e) => e.preventDefault()}
              />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Transparent protection layer is active on embedded video to block share interactions. Use LMS Play/Pause, Speed, and Fullscreen controls only.
      </p>
    </section>
  );
}
