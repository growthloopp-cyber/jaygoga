import { useEffect, useRef, useState } from 'react';

const HERO_POSTER_URL = '/src/assets/images/hero_luxury_sleeper_bus_1795571775133.jpg';
const HERO_VIDEO_MP4_URL = '/src/assets/videos/luxury_sleeper_highway.mp4';
const HERO_VIDEO_WEBM_URL = '/src/assets/videos/luxury_sleeper_highway.webm';

export function HeroBusVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoErrored, setVideoErrored] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Enforce muted inline autoplay properties silently with zero autoplay-blocking UI
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;

    const attemptPlay = () => {
      if (el.paused) {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // Silently keep poster / first frame if browser policy prevents playback; never render blocking UI
          });
        }
      }
    };

    attemptPlay();
    el.addEventListener('canplay', attemptPlay);
    return () => {
      el.removeEventListener('canplay', attemptPlay);
    };
  }, []);

  return (
    <div
      data-testid="hero-video-stage"
      className="relative w-full h-full overflow-hidden bg-[#09090B] pointer-events-none select-none"
    >
      {videoErrored ? (
        <img
          src={HERO_POSTER_URL}
          alt="Jay Goga Travels luxury sleeper coach cruising an open Gujarat expressway"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-85"
        />
      ) : (
        <video
          ref={videoRef}
          data-testid="hero-bus-video-player"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          aria-hidden="true"
          poster={HERO_POSTER_URL}
          onError={() => setVideoErrored(true)}
          className="w-full h-full object-cover pointer-events-none select-none"
        >
          <source src={HERO_VIDEO_WEBM_URL} type="video/webm" />
          <source src={HERO_VIDEO_MP4_URL} type="video/mp4" />
        </video>
      )}

      {/* Measured contrast scrims ensuring WCAG AA legibility over open-road footage */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#09090B]/92 via-[#09090B]/48 to-[#09090B]/18" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-[#09090B]/45" />
    </div>
  );
}
