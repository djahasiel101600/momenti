import { motion } from "framer-motion";
import { MapPin, Clock, Shirt } from "lucide-react";

const cards = (data) => [
  {
    icon: MapPin,
    label: "Venue",
    title: data.venue.name,
    body: data.venue.address,
    action: { label: "View Map", href: data.venue.mapUrl },
  },
  { icon: Clock, label: "Time", title: data.time, body: "Doors open thirty minutes prior" },
  { icon: Shirt, label: "Dress Code", title: data.dressCode, body: "Honour the tone of the evening" },
];

export default function EventDetails({ data }) {
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
            The Details
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif-display font-light text-4xl md:text-6xl mt-4"
          >
            When &amp; <span className="italic">where.</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px inv-ink-bg-10">
          {cards(data).map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="bg-[#F2F0ED] p-10 flex flex-col"
            >
              <c.icon size={24} strokeWidth={1} className="inv-accent mb-8" />
              <p className="text-[10px] tracking-luxe uppercase inv-ink-40 mb-3">
                {c.label}
              </p>
              <h3 className="font-serif-display text-2xl md:text-3xl mb-3">{c.title}</h3>
              <p className="text-sm inv-ink-60 leading-relaxed flex-1">{c.body}</p>
              {c.action && (
                <a
                  href={c.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase inv-accent border-b inv-accent-border-40 pb-1 self-start hover:border-[var(--inv-accent)] transition-colors"
                >
                  {c.action.label} ↗
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}