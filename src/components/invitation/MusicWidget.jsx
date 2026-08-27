import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

/**
 * Floating music control. Browsers refuse audible autoplay before any user
 * interaction, so when music.autoplay is on we attach a one-time pointerdown
 * listener that starts playback with the first tap anywhere — the standard
 * digital-invitation pattern.
 */
export default function MusicWidget({ music }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) {
        await audio.play();
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !music.url) return undefined;

    let cleanupPointer = () => {};
    if (music.autoplay && audio.paused) {
      const startOnFirstTouch = () => {
        audio
          .play()
          .then(() => setPlaying(true))
          .catch(() => setError(true));
      };
      window.addEventListener("pointerdown", startOnFirstTouch, { once: true });
      cleanupPointer = () => window.removeEventListener("pointerdown", startOnFirstTouch);
    }

    const onEndedLikeEvents = () => {}; // loop keeps it alive; placeholder for symmetry
    void onEndedLikeEvents;

    return () => {
      cleanupPointer();
      audio.pause();
      setPlaying(false);
    };
  }, [music.url, music.autoplay]);

  if (!music?.url || error) return null;

  return (
    <>
      <audio ref={audioRef} src={music.url} loop={music.loop} preload="none" />
      <motion.button
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
