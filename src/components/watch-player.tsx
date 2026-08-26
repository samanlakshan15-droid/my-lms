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
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy?: () => void;
};

type YouTubeWindow = Window &
  typeof globalThis & {
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
            onStateChange?: (event: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };

    onYouTubeIframeAPIReady?: () => void;
  };

function formatSeconds(total: number) {
  const safe = Math.max(0, Math.floor(total));

  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  return [hrs, mins, secs]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
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

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor(initialRemainingSeconds)),
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const [isMuted, setIsMuted] = useState(false);

  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const isExpired = useMemo(() => remaining <= 0, [remaining]);

  /*
   * ---------------------------------------------------------
   * SAVE WATCH PROGRESS
   * ---------------------------------------------------------
   */

  const flushProgress = async () => {
    const buffered = consumedBufferRef.current;

    if (buffered <= 0 || flushInFlightRef.current) {
      return;
    }

    flushInFlightRef.current = true;
    consumedBufferRef.current = 0;

    try {
      await fetch("/api/watch/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessId,
          consumedSeconds: buffered,
        }),
        keepalive: true,
      });
    } catch {
      consumedBufferRef.current += buffered;
    } finally {
      flushInFlightRef.current = false;
    }
  };

  /*
   * ---------------------------------------------------------
   * WATCH TIMER
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isPlaying || isExpired) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 0) {
          return 0;
        }

        consumedBufferRef.current += 1;

        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPlaying, isExpired]);

  /*
   * Flush every 5 seconds
   */

  useEffect(() => {
    if (consumedBufferRef.current >= 5) {
      void flushProgress();
    }
  }, [remaining]);

  /*
   * ---------------------------------------------------------
   * EXPIRED
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isExpired) {
      return;
    }

    setIsPlaying(false);

    if (html5Ref.current) {
      html5Ref.current.pause();
    }

    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.pauseVideo();
    }

    void flushProgress();
  }, [isExpired]);

  /*
   * ---------------------------------------------------------
   * BLOCK COPY / SHARE / DOWNLOAD SHORTCUTS
   * ---------------------------------------------------------
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

    /*
     * Right click / copy / cut / drag
     */

    const blockEvent = (event: Event) => {
      if (!inPlayer(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    /*
     * Keyboard protection
     */

    const blockKeys = (event: KeyboardEvent) => {
      if (!inPlayer(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      /*
       * Ctrl / Cmd shortcuts
       */

      const blockedCtrlShortcut =
        (event.ctrlKey || event.metaKey) &&
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
          "k",
        ].includes(key);

      /*
       * Developer tools shortcuts
       */

      const blockedDevTools =
        key === "f12" ||
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          ["i", "j", "c"].includes(key));

      /*
       * Save page
       */

      if (blockedCtrlShortcut || blockedDevTools) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    /*
     * Hide / switch tab
     */

    const flushOnHide = () => {
      void flushProgress();
      setIsPlaying(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushOnHide();
      }
    };

    document.addEventListener("contextmenu", blockEvent, true);
    document.addEventListener("copy", blockEvent, true);
    document.addEventListener("cut", blockEvent, true);
    document.addEventListener("dragstart", blockEvent, true);
    document.addEventListener("selectstart", blockEvent, true);
    document.addEventListener("keydown", blockKeys, true);
    document.addEventListener("auxclick", blockEvent, true);

    window.addEventListener("pagehide", flushOnHide);

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    return () => {
      document.removeEventListener(
        "contextmenu",
        blockEvent,
        true,
      );

      document.removeEventListener("copy", blockEvent, true);
      document.removeEventListener("cut", blockEvent, true);
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

      document.removeEventListener(
        "auxclick",
        blockEvent,
        true,
      );

      window.removeEventListener("pagehide", flushOnHide);

      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );

      void flushProgress();
    };
  }, [accessId]);

  /*
   * ---------------------------------------------------------
   * YOUTUBE PLAYER
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   *
   * controls: 0
   *
   * This hides the normal YouTube controls, including the
   * YouTube Share button.
   *
   * We create our own controls below.
   */

  useEffect(() => {
    if (!youtubeVideoId || html5VideoUrl) {
      return;
    }

    const w = window as YouTubeWindow;

    const createPlayer = () => {
      if (!w.YT?.Player) {
        return;
      }

      /*
       * Prevent duplicate player creation
       */

      if (youtubePlayerRef.current) {
        return;
      }

      youtubePlayerRef.current = new w.YT.Player(
        youtubeTargetId,
        {
          videoId: youtubeVideoId,

          width: "100%",
          height: "100%",

          playerVars: {
            /*
             * HIDE YOUTUBE CONTROLS
             */
            controls: 0,

            /*
             * Disable YouTube keyboard shortcuts
             */
            disablekb: 1,

            /*
             * Don't show related videos as much as possible
             */
            rel: 0,

            /*
             * Minimal YouTube branding
             */
            modestbranding: 1,

            /*
             * Inline playback
             */
            playsinline: 1,

            /*
             * We use our own fullscreen button
             */
            fs: 0,

            /*
             * Hide annotations
             */
            iv_load_policy: 3,

            /*
             * Use current website as origin
             */
            origin: window.location.origin,
          },

          events: {
            /*
             * PLAYER READY
             */

            onReady: () => {
              setIsReady(true);

              const player =
                youtubePlayerRef.current;

              if (player) {
                const duration =
                  player.getDuration();

                if (duration > 0) {
                  setVideoDuration(duration);
                }

                setIsMuted(player.isMuted());
              }
            },

            /*
             * PLAY / PAUSE / END
             */

            onStateChange: (event) => {
              /*
               * YouTube:
               *
               * 0 = ENDED
               * 1 = PLAYING
               * 2 = PAUSED
               * 3 = BUFFERING
               * 5 = CUED
               */

              if (event.data === 1) {
                if (!isExpired) {
                  setIsPlaying(true);
                } else {
                  youtubePlayerRef.current?.pauseVideo();
                  setIsPlaying(false);
                }
              }

              if (
                event.data === 2 ||
                event.data === 0 ||
                event.data === 5
              ) {
                setIsPlaying(false);
                void flushProgress();
              }
            },
          },
        },
      );
    };

    /*
     * API already loaded
     */

    if (w.YT?.Player) {
      createPlayer();
      return;
    }

    /*
     * Find existing YouTube API script
     */

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    /*
     * Add API script if needed
     */

    if (!existing) {
      const script =
        document.createElement("script");

      script.src =
        "https://www.youtube.com/iframe_api";

      script.async = true;

      document.body.appendChild(script);
    }

    /*
     * Wait for YouTube API
     */

    const previousCallback =
      w.onYouTubeIframeAPIReady;

    w.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      createPlayer();
    };

    return () => {
      /*
       * Don't destroy aggressively because React
       * development StrictMode can recreate effects.
       */
    };
  }, [
    youtubeVideoId,
    html5VideoUrl,
    youtubeTargetId,
    isExpired,
  ]);

  /*
   * ---------------------------------------------------------
   * UPDATE YOUTUBE PROGRESS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!youtubeVideoId || html5VideoUrl) {
      return;
    }

    if (!isPlaying) {
      return;
    }

    const progressTimer =
      window.setInterval(() => {
        const player =
          youtubePlayerRef.current;

        if (!player) {
          return;
        }

        const current =
          player.getCurrentTime();

        const duration =
          player.getDuration();

        if (duration > 0) {
          setVideoProgress(current);
          setVideoDuration(duration);
        }
      }, 500);

    return () => {
      window.clearInterval(progressTimer);
    };
  }, [
    youtubeVideoId,
    html5VideoUrl,
    isPlaying,
  ]);

  /*
   * ---------------------------------------------------------
   * CUSTOM YOUTUBE CONTROLS
   * ---------------------------------------------------------
   */

  const togglePlay = () => {
    if (isExpired) {
      return;
    }

    /*
     * HTML5
     */

    if (html5Ref.current) {
      if (html5Ref.current.paused) {
        void html5Ref.current.play();
      } else {
        html5Ref.current.pause();
      }

      return;
    }

    /*
     * YouTube
     */

    const player =
      youtubePlayerRef.current;

    if (!player) {
      return;
    }

    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  /*
   * ---------------------------------------------------------
   * MUTE
   * ---------------------------------------------------------
   */

  const toggleMute = () => {
    /*
     * HTML5
     */

    if (html5Ref.current) {
      html5Ref.current.muted =
        !html5Ref.current.muted;

      setIsMuted(html5Ref.current.muted);

      return;
    }

    /*
     * YouTube
     */

    const player =
      youtubePlayerRef.current;

    if (!player) {
      return;
    }

    if (player.isMuted()) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  /*
   * ---------------------------------------------------------
   * SEEK
   * ---------------------------------------------------------
   */

  const handleSeek = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value =
      Number(event.target.value);

    setVideoProgress(value);

    /*
     * HTML5
     */

    if (html5Ref.current) {
      html5Ref.current.currentTime = value;
      return;
    }

    /*
     * YouTube
     */

    youtubePlayerRef.current?.seekTo(
      value,
      true,
    );
  };

  /*
   * ---------------------------------------------------------
   * FULLSCREEN
   * ---------------------------------------------------------
   */

  const requestFullscreen = async () => {
    if (!playerShellRef.current) {
      return;
    }

    try {
      await playerShellRef.current.requestFullscreen();
    } catch {
      // Ignore fullscreen rejection
    }
  };

  /*
   * ---------------------------------------------------------
   * HTML5 VIDEO TIME UPDATE
   * ---------------------------------------------------------
   */

  const handleHTML5TimeUpdate = () => {
    const video = html5Ref.current;

    if (!video) {
      return;
    }

    setVideoProgress(video.currentTime);
    setVideoDuration(video.duration || 0);
  };

  /*
   * ---------------------------------------------------------
   * FORMAT VIDEO TIME
   * ---------------------------------------------------------
   */

  const formatVideoTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) {
      return "00:00";
    }

    const safe = Math.max(
      0,
      Math.floor(seconds),
    );

    const minutes = Math.floor(
      safe / 60,
    );

    const secs = safe % 60;

    return `${String(minutes).padStart(
      2,
      "0",
    )}:${String(secs).padStart(
      2,
      "0",
    )}`;
  };

  /*
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onCopy={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onCut={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPaste={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onAuxClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        /*
         * Disable right mouse button
         */

        if (e.button === 2) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
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

      {!isExpired ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={requestFullscreen}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            ⛶ Fullscreen
          </button>
        </div>
      ) : null}

      {/* EXPIRED */}

      {isExpired ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          Your watching time is over. Please contact your
          teacher for more access time.
        </div>
      ) : (
        <div
          ref={playerShellRef}
          className="video-shell overflow-hidden rounded-xl border border-slate-200 bg-black"
        >
          {/* =================================================
              HTML5 VIDEO
              ================================================= */}

          {html5VideoUrl ? (
            <div className="relative bg-black">
              <video
                ref={html5Ref}
                className="block h-auto w-full"
                src={html5VideoUrl}
                preload="metadata"
                controls={false}
                playsInline
                onPlay={() => {
                  setIsPlaying(true);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  void flushProgress();
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  void flushProgress();
                }}
                onTimeUpdate={handleHTML5TimeUpdate}
                onLoadedMetadata={() => {
                  if (html5Ref.current) {
                    setVideoDuration(
                      html5Ref.current.duration,
                    );
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
              />

              {/* CUSTOM CONTROLS */}

              <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-3">
                <input
                  type="range"
                  min="0"
                  max={videoDuration || 0}
                  step="0.1"
                  value={videoProgress}
                  onChange={handleSeek}
                  className="mb-2 w-full"
                />

                <div className="flex items-center gap-3 text-white">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="rounded px-2 py-1 hover:bg-white/20"
                  >
                    {isPlaying ? "❚❚" : "▶"}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    className="rounded px-2 py-1 hover:bg-white/20"
                  >
                    {isMuted ? "🔇" : "🔊"}
                  </button>

                  <span className="text-xs">
                    {formatVideoTime(
                      videoProgress,
                    )}{" "}
                    /{" "}
                    {formatVideoTime(
                      videoDuration,
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={requestFullscreen}
                    className="ml-auto rounded px-2 py-1 hover:bg-white/20"
                  >
                    ⛶
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* =================================================
               YOUTUBE
               ================================================= */

            <div className="relative bg-black">
              <div
                id={youtubeTargetId}
                className="aspect-video w-full"
              />

              {/* CUSTOM YOUTUBE CONTROLS */}

              <div className="absolute bottom-0 left-0 right-0 z-20 bg-black/85 p-3">
                {/* PROGRESS */}

                <input
                  type="range"
                  min="0"
                  max={videoDuration || 0}
                  step="0.1"
                  value={videoProgress}
                  onChange={handleSeek}
                  disabled={!isReady}
                  className="mb-2 w-full cursor-pointer"
                />

                <div className="flex items-center gap-3 text-white">
                  {/* PLAY */}

                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={!isReady}
                    className="rounded px-2 py-1 text-sm hover:bg-white/20 disabled:opacity-50"
                    aria-label={
                      isPlaying
                        ? "Pause video"
                        : "Play video"
                    }
                  >
                    {isPlaying ? "❚❚" : "▶"}
                  </button>

                  {/* MUTE */}

                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={!isReady}
                    className="rounded px-2 py-1 text-sm hover:bg-white/20 disabled:opacity-50"
                    aria-label={
                      isMuted
                        ? "Unmute video"
                        : "Mute video"
                    }
                  >
                    {isMuted ? "🔇" : "🔊"}
                  </button>

                  {/* TIME */}

                  <span className="text-xs">
                    {formatVideoTime(
                      videoProgress,
                    )}{" "}
                    /{" "}
                    {formatVideoTime(
                      videoDuration,
                    )}
                  </span>

                  {/* FULLSCREEN */}

                  <button
                    type="button"
                    onClick={requestFullscreen}
                    className="ml-auto rounded px-2 py-1 text-sm hover:bg-white/20"
                    aria-label="Fullscreen"
                  >
                    ⛶
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Timer counts down only while video playback is
        active. Pausing or stopping the video pauses the
        timer.
      </p>
    </section>
  );
}
