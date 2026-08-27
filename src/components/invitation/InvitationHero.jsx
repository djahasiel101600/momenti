import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import MediaBlock from "@/components/invitation/MediaBlock";

export default function InvitationHero({ data }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // Names may or may not contain an ampersand: "John & Jane" animates as two
  // lines around a decorative "&", while single names render as one line.
  const nameParts = String(data.couple || "").split(/\s*&\s*/).filter(Boolean);
  const [firstName, ...restNames] = nameParts;
  const restLabel = restNames.join(" & ");

  const dateObj = new Date(data.date);
  const dateLabel = isNaN(dateObj.getTime())
    ? ""
    : dateObj.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

  return (
    <section ref={ref} className="relative h-screen min-h-[640px] overflow-hidden inv-bg">
      <motion.div style={{ scale, y }} className="absolute inset-0">
        <MediaBlock
          src={data.heroImage}
          alt={`Scene backdrop for ${data.couple || "the celebration"}`}
          className="w-full h-full"
        />
        <div className="absolute inset-0 inv-hero-overlay" />
      </motion.div>

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 inv-text"
      >
        {data.heroKicker && (
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-[11px] tracking-luxe uppercase inv-accent mb-6"
          >
            {data.heroKicker}
          </motion.span>
        )}

        <h1 className="font-serif-display font-light leading-[0.9] text-[16vw] md:text-[12vw] lg:text-[11vw]">
          <motion.span
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {firstName}
          </motion.span>
          {restLabel && (
            <>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="block italic inv-accent -my-2 md:-my-4"
              >
                &
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="block"
              >
                {restLabel}
              </motion.span>
            </>
          )}
        </h1>

        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 1, duration: 0.9 }}
          className="w-16 h-px inv-accent-bg my-8 origin-center"
        />

        {dateLabel && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="text-xs md:text-sm tracking-luxe-sm uppercase inv-text-80"
          >
            {dateLabel}
          </motion.p>
        )}

        {data.heroSubline && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25, duration: 0.8 }}
            className="mt-4 text-[10px] md:text-xs tracking-luxe-sm uppercase inv-text-60 max-w-md leading-relaxed"
          >
            {data.heroSubline}
          </motion.p>
        )}
      </motion.div>
    </section>
  );
}
