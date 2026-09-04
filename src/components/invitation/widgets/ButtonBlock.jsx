// Link button widget: a call-to-action (gift registry, travel, RSVP link).
export default function ButtonBlock({ data = {}, eyebrow = "", appearance }) {
  const label = String(data.label || "").trim();
  const url = String(data.url || "").trim();
  if (!label || !url) return null;
  return (
    <section className="inv-paper px-6 md:px-16 py-16 md:py-24" style={appearance?.style}>
      <div className="mx-auto max-w-2xl text-center">
        {eyebrow ? (
          <p className="text-[11px] tracking-luxe uppercase inv-accent mb-8">{eyebrow}</p>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase inv-accent inv-accent-border px-8 py-3.5 hover:bg-[var(--inv-accent)] hover:text-[var(--inv-paper)] transition-colors"
        >
          {label}
        </a>
      </div>
    </section>
  );
}