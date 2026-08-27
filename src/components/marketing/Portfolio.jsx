import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";

const templates = [
  {
    title: "Wedding",
    tag: "Editorial",
    href: "/john-doe",
    url: "/media/aa9ffa52d_generated_3c21d063.png",
    alt: "Wedding invitation theme with silk fabric and a single white flower",
  },
  {
    title: "Birthday",
    tag: "Celebratory",
    href: "/eleanor-30",
    url: "/media/cfa8f8f5b_generated_3a646b19.png",
    alt: "Birthday invitation theme with an elegant cake and candles",
  },
  {
    title: "Gala",
    tag: "Corporate",
    href: "/john-doe",
    url: "/media/89933be43_generated_7a55dc6a.png",
    alt: "Corporate gala invitation theme with a grand ballroom",
  },
];

export default function Portfolio() {
  return (
    <section id="templates" className="bg-[#0A0A0A] text-[#F2F0ED] py-28 md:py-40 px-6 lg:px-16">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-[11px] tracking-luxe uppercase text-[#C58A58]"
            >
              The Collection
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif-display font-light text-5xl md:text-7xl mt-4 leading-tight"
            >
              Templates, <span className="italic text-[#C58A58]">curated.</span>
            </motion.h2>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-[#F2F0ED]/50 max-w-sm text-sm leading-relaxed"
          >
            Each theme is a starting point — refined, animated, and tailored to the tone of
            your occasion.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {templates.map((t, i) => (
            <motion.a
              key={t.title}
              href={t.href}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="group relative block overflow-hidden rounded-sm bg-white/5"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src={t.url}
                  alt={t.alt}
                  fittingType="fill"
                  className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent opacity-80" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 transition-all duration-500 group-hover:ring-[#C58A58]/60 group-hover:shadow-[0_30px_60px_-20px_rgba(197,138,88,0.4)]" />
              </div>
              <div className="absolute bottom-0 inset-x-0 p-6 flex items-end justify-between">
                <div>
                  <p className="text-[10px] tracking-luxe uppercase text-[#C58A58] mb-1">
                    {t.tag}
                  </p>
                  <h3 className="font-serif-display text-3xl text-[#F2F0ED]">{t.title}</h3>
                </div>
                <span className="text-[#F2F0ED]/60 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-[#C58A58]">
                  →
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}