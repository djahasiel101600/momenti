import { emphasizedHeading } from "@/lib/templates";

// Text note widget: heading + paragraph on the light "paper" panel.
export default function TextBlock({ data = {}, eyebrow = "", appearance }) {
  const heading = String(data.heading || "").trim();
  const body = String(data.body || "").trim();
  if (!heading && !body) return null;
  const [lead, tail] = emphasizedHeading(heading) || [];
  return (
    <section className="inv-paper px-6 md:px-16 py-20 md:py-28" style={appearance?.style}>
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow ? (
          <p className="text-[11px] tracking-luxe uppercase inv-accent mb-6">{eyebrow}</p>
        ) : null}
        {heading ? (
          <h2 className="font-serif-display text-3xl md:text-4xl inv-ink">
            {lead}
            {tail ? <em className="inv-accent">{tail}</em> : null}
          </h2>
        ) : (
          <div className="w-10 h-px inv-accent-bg-40 mx-auto mb-8" />
        )}
        {body ? (
          <p className="mt-8 text-base md:text-lg leading-relaxed inv-ink-70 whitespace-pre-line">
            {body}
          </p>
        ) : null}
      </div>
    </section>
  );
}