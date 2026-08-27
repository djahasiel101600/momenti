import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image } from "@/components/ui/image";
import { X } from "lucide-react";

export default function Gallery({ data }) {
  const [active, setActive] = useState(null);

  return (
    <section className="bg-[#F2F0ED] inv-ink py-28 md:py-40 px-6 md:px-16">
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-[11px] tracking-luxe uppercase inv-accent"
          >
            Moments
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif-display font-light text-4xl md:text-6xl mt-4"
          >
            The <span className="italic">gallery.</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[180px] md:auto-rows-[260px]">
          {data.gallery.map((g, i) => (
            <motion.button
              key={i}
              onClick={() => setActive(g)}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className={`group relative overflow-hidden rounded-sm ${
                g.span === "tall" ? "row-span-2" : "col-span-2"
              }`}
            >
              <Image
                src={g.url}
                alt={g.alt}
                fittingType="fill"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-transparent group-hover:bg-black/20 transition-colors duration-500" />
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-[90] inv-bg-90 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <button
              className="absolute top-6 right-6 text-[#F2F0ED]/70 hover:text-[var(--inv-accent)] transition-colors"
              onClick={() => setActive(null)}
              aria-label="Close"
            >
              <X size={28} strokeWidth={1} />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full"
            >
              <Image
                src={active.url}
                alt={active.alt}
                fittingType="fit"
                className="w-full max-h-[80vh] rounded-sm"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}