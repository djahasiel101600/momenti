import { useEffect, useRef } from "react";

const FADE_MS = 850;
const FADE_WINDOW = 1.6; // seconds before the end to start the transition

/**
 * Autoplaying, muted, looping background video with configurable loop
 * transitions:
 * - "cut":       hard restart (native `loop`)
 * - "fade":      fades out near the end, restarts, fades back in
 * - "crossfade": two stacked layers alternate — one fades in as the other
 *                fades out, so there is never a visible gap
 */
export default function LoopingVideo({
  src,
  transition = "cut",
  className = "",
  alt = "",
}) {
  const aRef = useRef(null);
  const bRef = useRef(null);
  const live = useRef(null);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    live.current = a;

    if (transition === "cut") return undefined;

    const setOpacity = (el, v) => {
      if (!el) return;
      el.style.transition = `opacity ${FADE_MS}ms ease`;
      el.style.opacity = v;
    };
    const isCrossfade = transition === "crossfade" && a && b;
    let switching = false;

    if (a) {
      a.muted = true;
      a.style.opacity = 1;
      a.play().catch(() => {});
    }
    if (b) {
      b.muted = true;
      b.style.opacity = 0;
      b.pause();
    }

    const onTimeUpdate = (e) => {
      const el = e.target;
      if (switching || el !== live.current) return;
      const d = el.duration;
      if (!d || d - el.currentTime >= FADE_WINDOW) return;

      switching = true;
      if (isCrossfade) {
        const incoming = el === a ? b : a;
        incoming.currentTime = 0;
        incoming.play().catch(() => {});
        setOpacity(incoming, 1);
        setOpacity(el, 0);
        setTimeout(() => {
          el.pause();
          el.currentTime = 0;
          live.current = incoming;
          switching = false;
        }, FADE_MS + 60);
      } else {
        setOpacity(el, 0);
        setTimeout(() => {
          el.currentTime = 0;
          el.play().catch(() => {});
          setOpacity(el, 1);
          switching = false;
        }, FADE_MS + 60);
      }
    };

    a?.addEventListener("timeupdate", onTimeUpdate);
    b?.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      a?.removeEventListener("timeupdate", onTimeUpdate);
      b?.removeEventListener("timeupdate", onTimeUpdate);
      a?.pause();
      b?.pause();
    };
  }, [src, transition]);

  const cls = `w-full h-full object-cover ${className}`;

  if (transition === "crossfade") {
    return (
      <>
        <video
          ref={aRef}
          className={`${cls} absolute inset-0`}
          src={src}
          muted
          playsInline
          preload="auto"
          aria-label={alt || undefined}
        />
        <video
          ref={bRef}
          className={`${cls} absolute inset-0 opacity-0`}
          src={src}
          muted
          playsInline
          preload="auto"
          aria-label={alt || undefined}
        />
      </>
    );
  }

  if (transition === "fade") {
    return (
      <video
        ref={aRef}
        className={cls}
        src={src}
        muted
        playsInline
        preload="auto"
        aria-label={alt || undefined}
      />
    );
  }

  // "cut" — native looping autoplay (exactly the historical behaviour).
  return (
    <video
      src={src}
      className={cls}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={alt || undefined}
    />
  );
}
