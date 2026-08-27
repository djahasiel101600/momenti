import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function getRemaining(target) {
  const diff = target - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: false,
  };
}

const units = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
];

export default function CountdownTimer({ date }) {
  const target = new Date(date).getTime();
  const [t, setT] = useState(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setT(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <section className="bg-[#F2F0ED] inv-ink py-24 md:py-32 px-6">
      <div className="mx-auto max-w-4xl text-center">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-[11px] tracking-luxe uppercase inv-accent"
        >
          {t.done ? "The moment has arrived" : "Counting down to"}
        </motion.span>

        <div className="mt-12 flex items-start justify-center gap-6 md:gap-16">
          {units.map((u, i) => (
            <div key={u.key} className="flex flex-col items-center">
              <motion.div
                key={u.key + t[u.key]}
                initial={{ opacity: 0.6, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="font-serif-display font-light tabular-nums text-6xl md:text-8xl leading-none"
              >
                {String(t[u.key]).padStart(2, "0")}
              </motion.div>
              <span className="mt-4 text-[10px] tracking-luxe uppercase inv-ink-50">
                {u.label}
              </span>
              {i < units.length - 1 && (
                <span className="hidden md:block inv-accent-40 text-4xl absolute" />
              )}
            </div>
          ))}
        </div>

        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.3 }}
          className="mx-auto mt-16 h-px w-24 inv-accent-bg origin-center"
        />
      </div>
    </section>
  );
}