import { useEffect, useRef, useState } from 'react';

// YouTube Iframe API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          height: string;
          width: string;
          videoId: string;
          playerVars?: {
            autoplay?: number;
            controls?: number;
            disablekb?: number;
            enablejsapi?: number;
            fs?: number;
            iv_load_policy?: number;
            modestbranding?: number;
            rel?: number;
            start?: number;
          };
          events?: {
            onReady?: (event: any) => void;
            onStateChange?: (event: any) => void;
            onError?: (event: any) => void;
          };
        }
      ) => {
        playVideo: () => void;
        pauseVideo: () => void;
        seekTo: (seconds: number, allowSeekAhead: boolean) => void;
        getCurrentTime: () => number;
        getDuration: () => number;
        getPlayerState: () => number;
        destroy: () => void;
      };
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onEnded?: () => void;
}

export function YouTubePlayer({
  videoId,
  initialTime = 0,
  onTimeUpdate,
  onStateChange,
  onEnded,
}: YouTubePlayerProps) {
  const youtubePlayerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const playerId = useRef(
    `youtube-player-${Math.random().toString(36).substr(2, 9)}`
  );

  // Load YouTube Iframe API
  useEffect(() => {
    // Load YouTube API script if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Initialize player when API is ready
    const initializePlayer = () => {
      if (window.YT && window.YT.Player) {
        youtubePlayerRef.current = new window.YT.Player(playerId.current, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: 0,
            enablejsapi: 1,
            fs: 1,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            start: Math.floor(initialTime),
          },
          events: {
            onReady: (event) => {
              const player = event.target;
              setIsReady(true);

              // Set initial time if provided
              if (initialTime > 0) {
                player.seekTo(initialTime, true);
              }
            },
            onStateChange: (event) => {
              const player = event.target;
              const state = event.data;

              if (state === window.YT.PlayerState.PLAYING) {
                onStateChange?.(true);
              } else if (state === window.YT.PlayerState.PAUSED) {
                onStateChange?.(false);
              } else if (state === window.YT.PlayerState.ENDED) {
                onEnded?.();
              }
            },
            onError: (event) => {
              console.error('YouTube player error:', event);
            },
          },
        });
      }
    };

    if (window.YT && window.YT.Player) {
      initializePlayer();
    } else {
      window.onYouTubeIframeAPIReady = initializePlayer;
    }

    return () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
    };
  }, [videoId, initialTime]); // Removed onStateChange and onEnded from dependencies

  // Time update polling
  useEffect(() => {
    if (!isReady || !onTimeUpdate) return;

    const interval = setInterval(() => {
      if (youtubePlayerRef.current) {
        const currentTime = youtubePlayerRef.current.getCurrentTime();
        const duration = youtubePlayerRef.current.getDuration();
        onTimeUpdate(currentTime, duration);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isReady, onTimeUpdate]);

  return <div id={playerId.current} className="w-full h-full" />;
}
