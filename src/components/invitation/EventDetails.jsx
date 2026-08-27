import { motion } from "framer-motion";
import { MapPin, Clock, Shirt } from "lucide-react";
import { emphasizedHeading } from "@/lib/templates";

// Built-in momenti copy — overridden via the Studio editor.
const DEFAULT_DETAILS_HEADING = "When & where.";

export default function EventDetails({
  data,
  eyebrow = "The Details",
  heading,
  appearance,
}) {
  const [lead, tail] = emphasizedHeading(heading || DEFAULT_DETAILS_HEADING) || [];

  // Card bodies honor optional per-card notes written in the editor.
  const cards = [
    {
      icon: MapPin,
      label: "Venue",
      title: data.venue.name,
      body: data.venue.address,
      action: data.venue.mapUrl ? { label: "View Map", href: data.venue.mapUrl } : null,
    },
    {
      icon: Clock,
      label: "Time",
      title: data.time,
      body: data.timeNote || "Doors open thirty minutes prior",
    },
    {
      icon: Shirt,
      label: "Dress Code",
      title: data.dressCode,
      body: data.dressCodeNote || "Honour the tone of the evening",
    },
  ].filter((c) => c.title || c.body);

  return (
    <section className="inv-paper py-28 md:py-40 px-6 md:px-16" style={appearance?.style}>
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center mb-16">
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
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif-display font-light text-4xl md:text-6xl mt-4"
          >
            {lead}
            <span className="italic">{tail}</span>
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px inv-ink-bg-10">
          {cards.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="inv-card p-10 flex flex-col"
            >
              <c.icon size={24} strokeWidth={1} className="inv-accent mb-8" />
              <p className="text-[10px] tracking-luxe uppercase inv-ink-40 mb-3">
                {c.label}
              </p>
              {c.title && (
                <h3 className="font-serif-display text-2xl md:text-3xl mb-3">{c.title}</h3>
              )}
              {c.body && (
                <p className="text-sm inv-ink-60 leading-relaxed flex-1">{c.body}</p>
              )}
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

        {data.detailsNote && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mt-16 max-w-3xl mx-auto text-center"
          >
            <div className="w-10 h-px inv-accent-bg-40 mx-auto mb-8" />
            <p className="inv-ink-70 leading-relaxed whitespace-pre-line">
              {data.detailsNote}
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}
