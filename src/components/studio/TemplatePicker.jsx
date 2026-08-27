import { Image } from "@/components/ui/image";
import { TEMPLATES } from "@/lib/templates";

export default function TemplatePicker({ onSelect }) {
  return (
    <div>
      <h2 className="font-serif-display text-3xl md:text-4xl text-[#F2F0ED]">Choose a template</h2>
      <p className="mt-2 text-sm text-[#F2F0ED]/50">Start from a built-in theme — then make it entirely yours.</p>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        {TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)} className="group text-left">
            <div className="relative aspect-[3/4] overflow-hidden rounded-sm">
              <Image
                src={t.cover}
                alt={`${t.name} invitation template`}
                fittingType="fill"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-[#0A0A0A]/30 group-hover:bg-[#0A0A0A]/10 transition-colors duration-500" />
              <span
                className="absolute top-4 left-4 text-[10px] tracking-luxe uppercase"
                style={{ color: t.accentColor }}
              >
                {t.name}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/70">{t.tagline}</span>
              <span className="w-4 h-4 rounded-full" style={{ background: t.accentColor }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}