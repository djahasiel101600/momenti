import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Image } from "@/components/ui/image";

export default function InvitationHero({ data }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const dateObj = new Date(data.date);
  const dateLabel = dateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <section ref={ref} className="relative h-screen min-h-[640px] overflow-hidden inv-bg">
      <motion.div style={{ scale, y }} className="absolute inset-0">
        <Image
          src={data.heroImage}
          alt="Cinematic wide shot of an elegant stone archway at golden hour"
          fittingType="fill"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 inv-hero-overlay" />
      </motion.div>

      <motion.div
        style={{ y: textY, opacity: textOpacity }}
        className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 text-[#F2F0ED]"
      >
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-[11px] tracking-luxe uppercase inv-accent mb-6"
        >
          {data.eventType}
        </motion.span>

        <h1 className="font-serif-display font-light leading-[0.9] text-[16vw] md:text-[12vw] lg:text-[11vw]">
          <motion.span
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {data.couple.split(" & ")[0]}
          </motion.span>
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
            {data.couple.split(" & ")[1]}
          </motion.span>
        </h1>

        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 1, duration: 0.9 }}
          className="w-16 h-px inv-accent-bg my-8 origin-center"
        />

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.8 }}
          className="text-xs md:text-sm tracking-luxe-sm uppercase text-[#F2F0ED]/80"
        >
          {dateLabel}
        </motion.p>
      </motion.div>
    </section>
  );
}