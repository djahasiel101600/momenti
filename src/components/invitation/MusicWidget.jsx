import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

/**
 * Floating music control. Browsers refuse audible autoplay before any user
 * interaction, so when music.autoplay is on we try to start immediately
 * (works where the browser allows it) and otherwise start with the first
 * pointerdown anywhere. A gesture that lands on this button is ignored by
 * the global listener — the button manages playback itself, so a single
 * click can never both start and pause the track. The icon follows the
 * element's real play/pause events rather than call-site bookkeeping.
 */
export default function MusicWidget({ music }) {
  const audioRef = useRef(null);
  const buttonRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const url = String(music?.url || "");
  const wantsAutoplay = music?.autoplay !== false;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url) return undefined;

    setPlaying(false);
    setError(false);

    const tryPlay = () => {
      audio.play().catch(() => {
        /* blocked until a user gesture — the first-gesture listener handles it */
      });
    };
    if (wantsAutoplay) tryPlay();

    const onFirstGesture = (e) => {
      if (
        buttonRef.current &&
        e.target instanceof Node &&
        buttonRef.current.contains(e.target)
      ) {
        return; // the button's own click handler starts/stops playback
      }
      tryPlay();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      audio.pause();
    };
  }, [url, wantsAutoplay]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setError(true));
    } else {
      audio.pause();
    }
  };

  if (!url || error) return null;

  return (
    <>
      <audio
        ref={audioRef}
        src={url}
        loop={music?.loop !== false}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <motion.button
        ref={buttonRef}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        onClick={toggle}
        aria-label={playing ? "Pause music" : "Play music"}
        className="fixed bottom-6 left-6 z-50 inv-accent-bg inv-text px-4 py-4 rounded-full inv-accent-shadow hover:brightness-110 transition"
      >
        {playing ? <Volume2 size={20} strokeWidth={1.5} /> : <VolumeX size={20} strokeWidth={1.5} />}
      </motion.button>
    </>
  );
}

