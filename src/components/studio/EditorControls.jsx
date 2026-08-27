// Shared form primitives for the Studio invitation editor.
// Dark-panel aesthetic: obsidian background, pearl text, copper accents.

export function Header({ children }) {
  return (
    <div className="mb-8">
      <span className="text-[10px] tracking-luxe uppercase text-[#C58A58]">{children}</span>
      <div className="mt-3 h-px w-12 bg-[#C58A58]/40" />
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
      />
      {hint && <p className="mt-1.5 text-[10px] text-[#F2F0ED]/30">{hint}</p>}
    </label>
  );
}

export function TextAreaField({ label, value, onChange, placeholder, rows = 4, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <textarea
        rows={rows}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors resize-none"
      />
      {hint && <p className="mt-1.5 text-[10px] text-[#F2F0ED]/30">{hint}</p>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#141414]">
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1.5 text-[10px] text-[#F2F0ED]/30">{hint}</p>}
    </label>
  );
}

export function ColorField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded-sm bg-transparent border border-white/10 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] uppercase tracking-wider"
        />
      </div>
    </label>
  );
}

/** Switch-style visibility row used by the Layout tab. */
export function VisibilityRow({ checked, onChange, children }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`inline-flex items-center gap-2 px-3 py-1.5 border text-[9px] tracking-luxe-sm uppercase transition-colors ${
        checked
          ? "border-[#C58A58]/60 text-[#C58A58]"
          : "border-[#F2F0ED]/15 text-[#F2F0ED]/35 hover:border-[#F2F0ED]/40"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${checked ? "bg-[#C58A58]" : "bg-[#F2F0ED]/25"}`}
      />
      {checked ? "Visible" : "Hidden"}
    </button>
  );
}
/**
 * Per-section appearance picker: unset inherits the invitation-wide value;
 * "Customize…" promotes it to an explicit override, "Use inherited" clears.
 */
export function OptionalColorField({ label, value, onChange, inheritHint }) {
  const inherited = !value;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
        {inherited ? (
          <button
            type="button"
            onClick={() => onChange("#F2F0ED")}
            className="text-[9px] tracking-luxe-sm uppercase text-[#C58A58] hover:text-[#d89a68] transition-colors"
          >
            Customize…
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[9px] tracking-luxe-sm uppercase text-[#F2F0ED]/35 hover:text-[#F2F0ED]/70 transition-colors"
          >
            Use inherited
          </button>
        )}
      </div>
      {inherited ? (
        <p className="mt-3 pb-3 text-[11px] text-[#F2F0ED]/30 border-b border-dashed border-[#F2F0ED]/10">
          {inheritHint || "Inherits"}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-12 rounded-sm bg-transparent border border-white/10 cursor-pointer"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] uppercase tracking-wider"
          />
        </div>
      )}
    </div>
  );
}