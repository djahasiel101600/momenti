// Divider widget: a quiet horizontal separator in one of four small styles.
function LineDivider() {
  return <div className="w-28 h-px inv-accent-bg-40 mx-auto" aria-hidden="true" />;
}

function DotsDivider() {
  return (
    <div className="flex items-center gap-3 mx-auto" aria-hidden="true">
      <span className="w-1.5 h-1.5 rounded-full inv-accent-bg-40" />
      <span className="w-1.5 h-1.5 rounded-full inv-accent-bg-40" />
      <span className="w-1.5 h-1.5 rounded-full inv-accent-bg-40" />
    </div>
  );
}

function FlourishDivider() {
  return (
    <div className="flex items-center gap-3 mx-auto" aria-hidden="true">
      <div className="w-10 h-px inv-accent-bg-40" />
      <span className="w-3 h-3 inv-accent-bg-40 rotate-45 mt-[-2px]" />
      <div className="w-10 h-px inv-accent-bg-40" />
    </div>
  );
}

function SparkleDivider() {
  return (
    <div className="flex items-center gap-4 mx-auto" aria-hidden="true">
      <span className="text-lg inv-accent leading-none">âœ¦</span>
      <div className="w-16 h-px inv-accent-bg-40" />
      <span className="text-2xl inv-accent leading-none">âœ¦</span>
      <div className="w-16 h-px inv-accent-bg-40" />
      <span className="text-lg inv-accent leading-none">âœ¦</span>
    </div>
  );
}

const RENDERERS = {
  line: LineDivider,
  dots: DotsDivider,
  flourish: FlourishDivider,
  sparkle: SparkleDivider,
};

export default function DividerBlock({ data = {}, appearance }) {
  const style = String(data.style || "line");
  const Renderer = RENDERERS[style] || LineDivider;
  return (
    <section className="inv-paper px-6 md:px-16 py-14 md:py-20" style={appearance?.style}>
      <div className="flex justify-center">{Renderer()}</div>
    </section>
  );
}