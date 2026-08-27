import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function StickyRsvp() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.a
          href="#rsvp"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 right-6 z-50 inv-accent-bg inv-ink px-6 py-4 text-xs tracking-luxe-sm uppercase inv-accent-shadow inv-accent-hover transition-colors"
        >
          RSVP
        </motion.a>
      )}
    </AnimatePresence>
  );
}