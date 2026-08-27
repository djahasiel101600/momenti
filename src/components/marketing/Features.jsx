import { motion } from "framer-motion";
import { Clock, MapPin, Music, MailOpen } from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "Live Countdown",
    body: "A real-time countdown to the moment — pulsing numerals that build anticipation with every second.",
  },
  {
    icon: MailOpen,
    title: "RSVP Management",
    body: "Frictionless responses with elegant success states. Every guest, accounted for.",
  },
  {
    icon: MapPin,
    title: "Map Integration",
    body: "One tap to the venue. Directions, location, and context — never lost in a text thread.",
  },
  {
    icon: Music,
    title: "Ambient Sound",
    body: "Optional score that sets the tone the moment the invitation opens. A score for your story.",
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-[#0A0A0A] text-[#F2F0ED] py-28 md:py-40 px-6 lg:px-16 border-t border-white/5">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-20">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-5"
          >
            <span className="text-[11px] tracking-luxe uppercase text-[#C58A58]">The Craft</span>
            <h2 className="font-serif-display font-light text-5xl md:text-6xl mt-4 leading-tight">
              Engineered for the <span className="italic">unforgettable.</span>
            </h2>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="md:col-span-6 md:col-start-7 text-[#F2F0ED]/50 text-base leading-relaxed self-end"
          >
            Every invitation is built as a sequence of moments — preloader, reveal,
            countdown, story. Motion is intentional, never decorative. The result feels
            less like a webpage and more like a keepsake.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="group bg-[#0A0A0A] p-8 md:p-10 hover:bg-[#111] transition-colors duration-500"
            >
              <f.icon
                size={26}
                strokeWidth={1}
                className="text-[#C58A58] mb-8 transition-transform duration-500 group-hover:scale-110"
              />
              <h3 className="font-serif-display text-2xl mb-3">{f.title}</h3>
              <p className="text-sm text-[#F2F0ED]/50 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}