import { Image } from "@/components/ui/image";
import { mediaTypeFromUrl } from "@/lib/templates";
import LoopingVideo from "@/components/invitation/LoopingVideo";

/**
 * Renders an image or video slot consistently across the invitation.
 *
 * - `video` behaves like a cinematic backdrop: autoplay, muted, looping,
 *   no controls (hero background, story media). `poster`-style object cover.
 * - `image` defers to the responsive <Image> component (Wix-style sizing).
 * `controls` flips video into an interactive player (gallery lightbox).
 */
export default function MediaBlock({
  src,
  alt = "",
  className = "",
  mediaClassName = "",
  controls = false,
  loopTransition = "cut",
  imageProps = {},
}) {
  const type = mediaTypeFromUrl(src);

  if (!src) return null;

  if (type === "video") {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {controls ? (
          <video
            src={src}
            className={`w-full h-full object-contain ${mediaClassName}`}
            autoPlay
            controls
            playsInline
            preload="metadata"
            aria-label={alt || undefined}
          />
        ) : (
          <LoopingVideo src={src} transition={loopTransition} className={mediaClassName} alt={alt} />
        )}
      </div>
    );
  }

  if (type === "audio") {
    // Audio slots are handled by the dedicated music widget; render nothing here.
    return null;
  }

  return (
    <Image src={src} alt={alt} fittingType="fill" className={`${className} ${mediaClassName}`} {...imageProps} />
  );
}
