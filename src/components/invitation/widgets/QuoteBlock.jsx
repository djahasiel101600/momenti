// Quote widget: a large centered pull-quote with an optional attribution.
export default function QuoteBlock({ data = {}, eyebrow = "", appearance }) {
  const text = String(data.text || "").trim();
  const attribution = String(data.attribution || "").trim();
  if (!text) return null;
  return (
    <section className="inv-paper px-6 md:px-16 py-24 md:py-32" style={appearance?.style}>
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow ? (
          <p className="text-[11px] tracking-luxe uppercase inv-accent mb-10">{eyebrow}</p>
        ) : null}
        <blockquote className="font-serif-display text-2xl md:text-3xl inv-ink leading-snug">
          {text}
        </blockquote>
        {attribution ? (
          <p className="mt-10 text-xs tracking-luxe-sm uppercase inv-accent-40">{attribution}</p>
        ) : null}
      </div>
    </section>
  );
}