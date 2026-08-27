import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Image } from "@/components/ui/image";
import { emphasizedHeading, mixHex, resolveSectionAppearance } from "@/lib/templates";

// Falls back to the built-in momenti copy when no override is provided,
// keeping standalone usage of the component working.
const DEFAULT_STORY_HEADING = "How we met.";

export default function StorySection({ data, eyebrow = "Our Story", heading, appearance }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Per-section appearance: concrete hex values drive the scroll gradient
  // (a CSS variable cannot be interpolated by framer), while `style` scopes
  // --inv-paper / --inv-paper-ink / --inv-accent for everything inside.
  const app = appearance || resolveSectionAppearance(data, "story");

  const bg = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [app.hex.paper, mixHex(app.hex.paper, app.hex.ink, 0.08), app.hex.paper]
  );

  const imgScale = useTransform(scrollYProgress, [0, 1], [1.1, 1]);

  // Last word carries the signature italic emphasis (["How we ", "met."]).
  const [lead, tail] = emphasizedHeading(heading || DEFAULT_STORY_HEADING) || [];

  return (
    <motion.section
      ref={ref}
      style={{ backgroundColor: bg, ...app.style }}
      className="relative px-6 md:px-16 py-28 md:py-40 transition-colors"
    >
      <div className="mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative order-2 md:order-1"
        >
          <div className="relative overflow-hidden rounded-sm aspect-[3/4]">
            <motion.div style={{ scale: imgScale }} className="w-full h-full">
              <Image
                src={data.storyImage}
                alt={`A quiet moment from the story of ${data.couple || "us"}`}
                fittingType="fill"
                className="w-full h-full object-cover"
              />
            </motion.div>
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.4 }}
            className="absolute -bottom-3 -right-3 w-24 h-px inv-accent-bg origin-left hidden md:block"
          />
        </motion.div>

        <div className="order-1 md:order-2">
          {eyebrow && (
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-[11px] tracking-luxe uppercase inv-accent"
            >
              {eyebrow}
            </motion.span>
          )}
          <motion.h2
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif-display font-light text-4xl md:text-6xl leading-tight mt-6"
          >
            {lead}
            <span className="italic">{tail}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 text-lg leading-relaxed inv-ink-70 max-w-md"
          >
            {data.story}
          </motion.p>
        </div>
      </div>
    </motion.section>
  );
}
