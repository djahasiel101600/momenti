import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Image } from "@/components/ui/image";
import { useAuth } from "@/lib/AuthContext";

const eventTypes = ["WEDDING", "GALA", "SOIRÉE", "ANNIVERSARY", "ENGAGEMENT", "CELEBRATION"];

const ENVELOPE_URL =
  "/media/eda2d0b14_generated_6fecf10c.png";

export default function Hero() {
  const { appPublicSettings } = useAuth();
  const business = appPublicSettings?.public_settings?.business || {};
  // "View Demo" button + template cards point here (default: /studio).
  const sampleLink = business?.sampleLink || "/studio";
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // cursor "lens" reveal over the envelope
  const [pos, setPos] = useState({ x: -200, y: -200 });
  const [hovering, setHovering] = useState(false);

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-screen bg-[#0A0A0A] text-[#F2F0ED] overflow-hidden flex"
    >
      {/* Left — headline + marquee */}
      <motion.div
        style={{ y, opacity }}
        className="w-full md:w-1/2 flex flex-col justify-center px-6 lg:px-16 pt-28 pb-16 md:pt-0"
      >
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-[11px] tracking-luxe uppercase text-[color:var(--brand-accent)] mb-8"
        >
          Digital Invitations
        </motion.span>

        <h1 className="font-serif-display font-light leading-[0.95] text-balance text-[15vw] md:text-[7vw] lg:text-[6.2vw]">
          <motion.span
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            Digital
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="block italic text-[color:var(--brand-accent)]"
          >
            Invitations
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            that Move You.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="mt-10 max-w-md text-[#F2F0ED]/60 text-base leading-relaxed"
        >
          We craft animated, editorial invitations for life's most profound milestones —
          each one a digital unboxing, a keepsake in motion.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.8 }}
          className="mt-10 flex items-center gap-6"
        >
          <a
            href="#contact"
            className="group inline-flex items-center gap-3 text-xs tracking-luxe-sm uppercase bg-[color:var(--brand-accent)] text-[#0A0A0A] px-8 py-4 hover:bg-[color:var(--brand-accent-hover)] transition-colors"
          >
            Get Started
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
          <a
            href={sampleLink}
            className="text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/70 hover:text-[#F2F0ED] transition-colors border-b border-[#F2F0ED]/30 pb-1"
          >
            View Demo
          </a>
        </motion.div>

        {/* vertical marquee of event types */}
        <div className="hidden md:block mt-16 h-24 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0A0A] pointer-events-none" />
          <motion.div
            animate={{ y: ["0%", "-50%"] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="flex flex-col gap-3"
          >
            {[...eventTypes, ...eventTypes].map((t, i) => (
              <span key={i} className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/30 whitespace-nowrap">
                {t} <span className="text-[color:var(--brand-accent)]">/</span>
              </span>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Right — floating envelope with cursor lens reveal */}
      <div className="hidden md:flex md:w-1/2 relative items-center justify-center border-l border-white/5">
        <div
          className="absolute inset-0"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
          }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {/* base envelope */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-[78%] max-w-md"
            >
              <Image
                src={ENVELOPE_URL}
                alt="Elegant cream invitation envelope with copper wax seal"
                fittingType="fit"
                className="w-full aspect-[3/4] object-cover rounded-sm"
              />
            </motion.div>
          </motion.div>

          {/* lens reveal layer — couple names revealed under the cursor */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              opacity: hovering ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]"
              style={{
                maskImage: `radial-gradient(circle 140px at ${pos.x}px ${pos.y}px, transparent 0%, transparent 60%, #000 100%)`,
                WebkitMaskImage: `radial-gradient(circle 140px at ${pos.x}px ${pos.y}px, transparent 0%, transparent 60%, #000 100%)`,
              }}
            >
              <div className="text-center px-10">
                <p className="text-[10px] tracking-luxe uppercase text-[color:var(--brand-accent)] mb-4">
                  You're Invited
                </p>
                <p className="font-serif-display italic text-5xl text-[#F2F0ED]">John &amp; Jane</p>
                <p className="mt-4 text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/50">
                  15 . 06 . 2027
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* thin self-drawing rule lines */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 1.2, ease: "easeInOut" }}
          className="absolute top-[18%] left-0 right-0 h-px bg-[color-mix(in_srgb,var(--brand-accent)_40%,transparent)] origin-left"
        />
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1, duration: 1.2, ease: "easeInOut" }}
          className="absolute bottom-[18%] left-0 right-0 h-px bg-[color-mix(in_srgb,var(--brand-accent)_40%,transparent)] origin-right"
        />
      </div>

      {/* scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#F2F0ED]/40"
      >
        <span className="text-[10px] tracking-luxe uppercase">Scroll</span>
        <motion.span
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="block w-px h-8 bg-[#F2F0ED]/40"
        />
      </motion.div>
    </section>
  );
}