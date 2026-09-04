import { Image } from "@/components/ui/image";

// Image widget: a single framed photo with an optional caption.
export default function ImageBlock({ data = {}, appearance }) {
  const url = String(data.url || "").trim();
  const caption = String(data.caption || "").trim();
  if (!url) return null;
  return (
    <section className="inv-paper px-6 md:px-16 py-20 md:py-28" style={appearance?.style}>
      <div className="mx-auto max-w-4xl">
        <div className="aspect-[4/3] overflow-hidden rounded-sm border inv-accent-border-40">
          <Image src={url} fittingType="fill" className="w-full h-full object-cover" />
        </div>
        {caption ? (
          <p className="mt-4 text-center text-[11px] tracking-luxe uppercase inv-ink-50 leading-relaxed">
            {caption}
          </p>
        ) : null}
      </div>
    </section>
  );
}