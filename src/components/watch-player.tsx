"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WatchPlayerProps = {
  title: string;
  embedUrl?: string;
  html5VideoUrl?: string;
  expiresAtIso: string;
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
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
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
    };
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

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";

  const safe = Math.max(0, Math.floor(seconds));

  const mins = Math.floor(safe / 60);
  const secs = safe % 60;

  return `${String(mins).padStart(2, "0")}:${String(
    secs,
  ).padStart(2, "0")}`;
}

export default function WatchPlayer({
  title,
  embedUrl,
  html5VideoUrl,
  expiresAtIso,
}: WatchPlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const html5Ref = useRef<HTMLVideoElement | null>(null);
  const youtubePlayerRef =
    useRef<YouTubePlayer | null>(null);

  const youtubeId = useMemo(() => {
    if (!embedUrl) return "";

    try {
      const url = new URL(embedUrl);

      if (url.hostname.includes("youtube.com")) {
        const parts = url.pathname.split("/");

        const embedIndex =
          parts.findIndex((part) => part === "embed");

        if (
          embedIndex !== -1 &&
          parts[embedIndex + 1]
        ) {
          return parts[embedIndex + 1];
        }
      }

      if (url.hostname === "youtu.be") {
        return url.pathname.replace("/", "");
      }
    } catch {
      return "";
    }

    return "";
  }, [embedUrl]);

  const expiry = useMemo(
    () => new Date(expiresAtIso).getTime(),
    [expiresAtIso],
  );

  const [remaining, setRemaining] = useState(() =>
    Math.floor((expiry - Date.now()) / 1000),
  );

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [isMuted, setIsMuted] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [playbackRate, setPlaybackRate] =
    useState(1);

  const [showSettings, setShowSettings] =
    useState(false);

  const [showShareMessage, setShowShareMessage] =
    useState(false);

  const [showControls, setShowControls] =
    useState(true);

  const controlsTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const isExpired = remaining <= 0;

  /*
   * =========================================================
   * EXPIRY TIMER
   * =========================================================
   */

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(
        Math.floor(
          (expiry - Date.now()) / 1000,
        ),
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [expiry]);

  /*
   * =========================================================
   * BLOCK COPY / RIGHT CLICK
   * =========================================================
   */

  useEffect(() => {
    const inPlayer = (
      target: EventTarget | null,
    ) => {
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

    const blockKeys = (
      event: KeyboardEvent,
    ) => {
      if (!inPlayer(event.target)) return;

      const key = event.key.toLowerCase();

      const blocked =
        ((event.ctrlKey ||
          event.metaKey) &&
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
   * =========================================================
   * LOAD YOUTUBE IFRAME API
   * =========================================================
   */

  useEffect(() => {
    if (!youtubeId || html5VideoUrl) {
      return;
    }

    const w = window as YouTubeWindow;

    const createPlayer = () => {
      if (!w.YT?.Player) return;

      if (youtubePlayerRef.current) {
        return;
      }

      youtubePlayerRef.current =
        new w.YT.Player(
          "custom-youtube-player",
          {
            videoId: youtubeId,

            width: "100%",
            height: "100%",

            playerVars: {
              /*
               * IMPORTANT:
               * Hide YouTube's own black controls.
               */
              controls: 0,

              /*
               * Disable YouTube keyboard controls.
               */
              disablekb: 1,

              /*
               * Reduce related videos.
               */
              rel: 0,

              modestbranding: 1,

              playsinline: 1,

              /*
               * We provide our own fullscreen.
               */
              fs: 0,

              iv_load_policy: 3,

              origin: window.location.origin,
            },

            events: {
              onReady: () => {
                const player =
                  youtubePlayerRef.current;

                if (!player) return;

                const videoDuration =
                  player.getDuration();

                setDuration(videoDuration);

                setIsMuted(
                  player.isMuted(),
                );
              },

              onStateChange: (event) => {
                /*
                 * 0 = ended
                 * 1 = playing
                 * 2 = paused
                 * 3 = buffering
                 */

                if (event.data === 1) {
                  if (!isExpired) {
                    setIsPlaying(true);
                  }
                }

                if (
                  event.data === 0 ||
                  event.data === 2
                ) {
                  setIsPlaying(false);
                }
              },
            },
          },
        );
    };

    if (w.YT?.Player) {
      createPlayer();
      return;
    }

    const existing =
      document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      );

    if (!existing) {
      const script =
        document.createElement("script");

      script.src =
        "https://www.youtube.com/iframe_api";

      script.async = true;

      document.body.appendChild(script);
    }

    const previous =
      w.onYouTubeIframeAPIReady;

    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      createPlayer();
    };
  }, [youtubeId, html5VideoUrl, isExpired]);

  /*
   * =========================================================
   * UPDATE YOUTUBE PROGRESS
   * =========================================================
   */

  useEffect(() => {
    if (!youtubeId || html5VideoUrl) {
      return;
    }

    const timer = setInterval(() => {
      const player =
        youtubePlayerRef.current;

      if (!player) return;

      const current =
        player.getCurrentTime();

      const total =
        player.getDuration();

      if (total > 0) {
        setProgress(current);
        setDuration(total);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [youtubeId, html5VideoUrl]);

  /*
   * =========================================================
   * PLAY / PAUSE
   * =========================================================
   */

  const togglePlay = () => {
    if (isExpired) return;

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

    if (!player) return;

    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  /*
   * =========================================================
   * MUTE
   * =========================================================
   */

  const toggleMute = () => {
    /*
     * HTML5
     */

    if (html5Ref.current) {
      html5Ref.current.muted =
        !html5Ref.current.muted;

      setIsMuted(
        html5Ref.current.muted,
      );

      return;
    }

    /*
     * YouTube
     */

    const player =
      youtubePlayerRef.current;

    if (!player) return;

    if (player.isMuted()) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  /*
   * =========================================================
   * SEEK
   * =========================================================
   */

  const handleSeek = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value =
      Number(event.target.value);

    setProgress(value);

    /*
     * HTML5
     */

    if (html5Ref.current) {
      html5Ref.current.currentTime =
        value;

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
   * =========================================================
   * PLAYBACK SPEED
   * =========================================================
   */

  const changePlaybackRate = (
    rate: number,
  ) => {
    setPlaybackRate(rate);

    /*
     * HTML5
     */

    if (html5Ref.current) {
      html5Ref.current.playbackRate =
        rate;
    }

    /*
     * YouTube
     */

    youtubePlayerRef.current?.setPlaybackRate(
      rate,
    );

    setShowSettings(false);
  };

  /*
   * =========================================================
   * FULLSCREEN
   * =========================================================
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

  /*
   * =========================================================
   * SHARE
   * =========================================================
   */

  const handleShare = () => {
    setShowShareMessage(true);
    setShowSettings(false);

    setTimeout(() => {
      setShowShareMessage(false);
    }, 3500);
  };

  /*
   * =========================================================
   * AUTO HIDE CONTROLS
   * =========================================================
   */

  const revealControls = () => {
    setShowControls(true);

    if (controlsTimerRef.current) {
      clearTimeout(
        controlsTimerRef.current,
      );
    }

    controlsTimerRef.current =
      setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
          setShowSettings(false);
        }
      }, 3000);
  };

  /*
   * =========================================================
   * EXPIRED
   * =========================================================
   */

  useEffect(() => {
    if (!isExpired) return;

    setIsPlaying(false);

    html5Ref.current?.pause();

    youtubePlayerRef.current?.pauseVideo();
  }, [isExpired]);

  /*
   * =========================================================
   * HTML5 EVENTS
   * =========================================================
   */

  const handleTimeUpdate = () => {
    const video = html5Ref.current;

    if (!video) return;

    setProgress(video.currentTime);
    setDuration(video.duration || 0);
  };

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur"
      onMouseMove={revealControls}
      onContextMenu={(e) =>
        e.preventDefault()
      }
      onCopy={(e) =>
        e.preventDefault()
      }
      onCut={(e) =>
        e.preventDefault()
      }
      onDragStart={(e) =>
        e.preventDefault()
      }
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* =====================================================
          HEADER
          ===================================================== */}

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

      {/* =====================================================
          PLAYER
          ===================================================== */}

      {isExpired ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          Your watching time is over. Please
          contact your teacher for more access
          time.
        </div>
      ) : (
        <div
          ref={playerRef}
          className="group relative aspect-video overflow-hidden rounded-xl bg-black"
          onMouseMove={revealControls}
        >
          {/* =================================================
              VIDEO
              ================================================= */}

          {html5VideoUrl ? (
            <video
              ref={html5Ref}
              src={html5VideoUrl}
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              controls={false}
              onPlay={() =>
                setIsPlaying(true)
              }
              onPause={() =>
                setIsPlaying(false)
              }
              onEnded={() =>
                setIsPlaying(false)
              }
              onTimeUpdate={
                handleTimeUpdate
              }
              onLoadedMetadata={() => {
                if (html5Ref.current) {
                  setDuration(
                    html5Ref.current
                      .duration,
                  );
                }
              }}
              onContextMenu={(e) =>
                e.preventDefault()
              }
            />
          ) : (
            <div
              id="custom-youtube-player"
              className="absolute inset-0"
            />
          )}

          {/* =================================================
              CENTER PLAY BUTTON
              ================================================= */}

          {!isPlaying && (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white backdrop-blur transition hover:scale-110 hover:bg-black/80"
            >
              ▶
            </button>
          )}

          {/* =================================================
              SHARE MESSAGE
              ================================================= */}

          {showShareMessage && (
            <div className="absolute left-1/2 top-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/90 p-6 text-center text-white shadow-2xl backdrop-blur-xl">
              <div className="mb-3 text-4xl">
                🔒
              </div>

              <h3 className="mb-2 text-lg font-semibold">
                Sharing Disabled
              </h3>

              <p className="text-sm text-slate-300">
                Sharing or copying this video
                is not allowed from the LMS
                player.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowShareMessage(false)
                }
                className="mt-5 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
              >
                OK
              </button>
            </div>
          )}

          {/* =================================================
              CUSTOM TRANSPARENT CONTROL BAR
              ================================================= */}

          <div
            className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${
              showControls
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            {/* Gradient */}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

            <div className="relative px-4 pb-3 pt-10">
              {/* =================================================
                  PROGRESS BAR
                  ================================================= */}

              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={progress}
                onChange={handleSeek}
                className="mb-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-white"
              />

              {/* =================================================
                  CONTROLS
                  ================================================= */}

              <div className="flex items-center gap-2 text-white">
                {/* PLAY */}

                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/20"
                  title={
                    isPlaying
                      ? "Pause"
                      : "Play"
                  }
                >
                  {isPlaying ? (
                    <span className="text-lg">
                      ❚❚
                    </span>
                  ) : (
                    <span className="text-lg">
                      ▶
                    </span>
                  )}
                </button>

                {/* VOLUME */}

                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/20"
                  title={
                    isMuted
                      ? "Unmute"
                      : "Mute"
                  }
                >
                  {isMuted ? "🔇" : "🔊"}
                </button>

                {/* TIME */}

                <span className="min-w-[100px] text-xs text-white/90">
                  {formatVideoTime(
                    progress,
                  )}{" "}
                  /{" "}
                  {formatVideoTime(
                    duration,
                  )}
                </span>

                {/* SPACER */}

                <div className="flex-1" />

                {/* SHARE */}

                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-9 items-center gap-1 rounded-lg px-3 text-sm transition hover:bg-white/20"
                  title="Sharing disabled"
                >
                  ↗
                  <span className="hidden sm:inline">
                    Share
                  </span>
                </button>

                {/* SETTINGS */}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setShowSettings(
                        (prev) => !prev,
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-white/20"
                    title="Settings"
                  >
                    ⚙️
                  </button>

                  {/* =================================================
                      SETTINGS MENU
                      ================================================= */}

                  {showSettings && (
                    <div className="absolute bottom-12 right-0 w-52 overflow-hidden rounded-xl border border-white/10 bg-black/90 p-2 text-white shadow-2xl backdrop-blur-xl">
                      <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/60">
                        Playback Speed
                      </div>

                      {[
                        0.5,
                        0.75,
                        1,
                        1.25,
                        1.5,
                        2,
                      ].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() =>
                            changePlaybackRate(
                              rate,
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-white/10 ${
                            playbackRate ===
                            rate
                              ? "bg-white/15"
                              : ""
                          }`}
                        >
                          <span>
                            {rate === 1
                              ? "Normal"
                              : `${rate}x`}
                          </span>

                          {playbackRate ===
                            rate && (
                            <span>
                              ✓
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* FULLSCREEN */}

                <button
                  type="button"
                  onClick={
                    handleFullscreen
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-white/20"
                  title="Fullscreen"
                >
                  ⛶
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          INFORMATION
          ===================================================== */}

      <p className="text-xs text-slate-500">
        Sharing, copying, right-click actions and
        direct download functionality are disabled
        in the LMS player.
      </p>
    </section>
  );
}
