import { useState } from "react";
import { base44 } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, ArrowLeft, ChevronUp, ChevronDown } from "lucide-react";
import ImageField from "./ImageField";
import {
  Header,
  Field,
  TextAreaField,
  SelectField,
  ColorField,
  OptionalColorField,
  VisibilityRow,

} from "./EditorControls";
import {
  SECTION_DEFS,
  SECTION_DEFAULT_EYEBROWS,
  DEFAULT_HEADINGS,
  STYLE_PRESETS,
} from "@/lib/templates";

const SECTION_STYLE_KEYS = ["bgColor", "textColor", "accentColor"];
function normalizeSectionStyles(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const cleaned = {};
    for (const key of SECTION_STYLE_KEYS) {
      if (typeof entry[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(entry[key])) cleaned[key] = entry[key];
    }
    if (Object.keys(cleaned).length) out[id] = cleaned;
  }
  return out;
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "layout", label: "Sections" },
  { id: "style", label: "Style" },
  { id: "media", label: "Media" },
];

// Build editor state from a stored record or fresh template defaults,
// preserving empty overrides so built-in copy stays live.
function buildForm(initial) {
  const i = initial || {};
  const sectionsIn = Array.isArray(i.sections) && i.sections.length
    ? i.sections
    : SECTION_DEFS.map((d) => ({ id: d.id, visible: d.id !== "countdown" || i.countdownVisible !== false }));
  return {
    slug: i.slug || "",
    title: i.title || "",
    template: i.template || "wedding",
    couple: i.couple || "",
    coupleShort: i.coupleShort || "",
    eventType: i.eventType || "",
    date: toLocalInput(i.date),
    venueName: i.venueName || "",
    venueAddress: i.venueAddress || "",
    mapUrl: i.mapUrl || "",
    time: i.time || "",
    dressCode: i.dressCode || "",
    story: i.story || "",
    heroImage: i.heroImage || "",
    storyImage: i.storyImage || "",
    gallery: Array.isArray(i.gallery) ? i.gallery.map((g) => ({ ...g })) : [],
    accentColor: i.accentColor || "#C58A58",
    backgroundColor: i.backgroundColor || "#0A0A0A",
    heroKicker: i.heroKicker || "",
    heroSubline: i.heroSubline || "",
    timeNote: i.timeNote || "",
    dressCodeNote: i.dressCodeNote || "",
    detailsNote: i.detailsNote || "",
    rsvpNote: i.rsvpNote || "",
    rsvpMaxGuests: String(i.rsvpMaxGuests ?? 5),
    headings: typeof i.headings === "object" && i.headings ? { ...i.headings } : {},
    sections: sectionsIn.map((s) => ({
      id: s.id,
      label: typeof s.label === "string" && s.label ? s.label : SECTION_DEFAULT_EYEBROWS[s.id] || s.id,
      visible: s.visible !== false,
    })),
    sectionStyles: normalizeSectionStyles(i.sectionStyles),
    theme: {
      textColor: i.theme?.textColor || "#F2F0ED",
      paperColor: i.theme?.paperColor || "#F2F0ED",
      displayFont: i.theme?.displayFont === "sans" ? "sans" : "serif",
    },
  };
}

export default function InvitationEditor({ initial, recordId, onSaved, onCancel }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => buildForm(initial));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("content");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setTheme = (k, v) => setForm((f) => ({ ...f, theme: { ...f.theme, [k]: v } }));
  const setHeading = (id, v) => setForm((f) => ({ ...f, headings: { ...f.headings, [id]: v } }));
  const patchSection = (id, patch) =>
    setForm((f) => ({ ...f, sections: f.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveSection = (idx, dir) =>
    setForm((f) => {
      const arr = [...f.sections];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return f;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...f, sections: arr };
    });
  const setSectionStyle = (id, key, v) =>
    setForm((f) => ({
      ...f,
      sectionStyles: { ...f.sectionStyles, [id]: { ...(f.sectionStyles?.[id] || {}), [key]: v } },
    }));

  const applyPreset = (p) =>
    setForm((f) => ({
      ...f,
      accentColor: p.accentColor,
      backgroundColor: p.backgroundColor,
      theme: { ...f.theme, textColor: p.textColor },
    }));
  const addGallery = () => set("gallery", [...form.gallery, { url: "", alt: "", span: "wide" }]);
  const removeGallery = (i) => set("gallery", form.gallery.filter((_, idx) => idx !== i));
  const updateGallery = (i, patch) =>
    set("gallery", form.gallery.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));

  const handleSave = async () => {
    if (!form.slug || !form.couple || !form.eventType || !form.date) {
      toast({
        title: "Missing required fields",
        description: "Slug, host name, event type and date are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, title: form.title || `${form.couple} · ${form.eventType}` };
      const record = recordId
        ? await base44.entities.Invitation.update(recordId, payload)
        : await base44.entities.Invitation.create(payload);
      toast({ title: "Saved", description: "Your invitation has been saved." });
      onSaved(record);
    } catch (err) {
      toast({
        title: "Could not save",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="text-[10px] tracking-luxe uppercase text-[#C58A58]">
            {recordId ? "Editing" : "New invitation"}
          </span>
          <h2 className="font-serif-display text-3xl md:text-4xl text-[#F2F0ED] mt-2">
            {form.couple || "Untitled"}
          </h2>
        </div>
        <nav className="flex gap-1 border border-white/10 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-[10px] tracking-luxe-sm uppercase transition-colors ${
                tab === t.id
                  ? "bg-[#C58A58] text-[#0A0A0A]"
                  : "text-[#F2F0ED]/50 hover:text-[#F2F0ED]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
        <div className="space-y-16">
          {tab === "content" && (
            <>
              <section>
                <Header>Headlines</Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Kicker" value={form.heroKicker} onChange={(v) => set("heroKicker", v)} placeholder="Together with their families" hint="Small caps line above the names — blank falls back to event type" />
                  <Field label="Page Title" value={form.title} onChange={(v) => set("title", v)} placeholder="John & Jane · Wedding" />
                  <TextAreaField label="Sub-line under the date" rows={2} value={form.heroSubline} onChange={(v) => set("heroSubline", v)} placeholder="Please join us for dinner & dancing" />
                </div>
              </section>

              <section>
                <Header>Hosts</Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Host / Couple Name" value={form.couple} onChange={(v) => set("couple", v)} placeholder="John & Jane" />
                  <Field label="Short Monogram" value={form.coupleShort} onChange={(v) => set("coupleShort", v)} placeholder="J & J" />
                  <Field label="Event Type" value={form.eventType} onChange={(v) => set("eventType", v)} placeholder="Wedding" />
                  <label className="block">
                    <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">Date &amp; Time</span>
                    <input
                      type="datetime-local"
                      value={form.date}
                      onChange={(e) => set("date", e.target.value)}
                      className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] transition-colors"
                    />
                  </label>
                </div>
              </section>

              <section>
                <Header>Event Details</Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Start Time Label" value={form.time} onChange={(v) => set("time", v)} placeholder="5:00 PM" />
                  <Field label="Dress Code" value={form.dressCode} onChange={(v) => set("dressCode", v)} placeholder="Black Tie Optional" />
                  <Field label="Venue Name" value={form.venueName} onChange={(v) => set("venueName", v)} placeholder="The Grand Ballroom" />
                  <Field label="Venue Address" value={form.venueAddress} onChange={(v) => set("venueAddress", v)} placeholder="123 Main St, New York, NY" />
                  <div className="md:col-span-2">
                    <Field label="Map URL" value={form.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.google.com/..." />
                  </div>
                  <TextAreaField label="Time note" rows={2} value={form.timeNote} onChange={(v) => set("timeNote", v)} placeholder="Ceremony begins promptly — doors from 4:30" hint="Replaces the default line in the Details card" />
                  <TextAreaField label="Dress note" rows={2} value={form.dressCodeNote} onChange={(v) => set("dressCodeNote", v)} placeholder="Garden formal; heels may sink on lawns" hint="Replaces the default line in the Details card" />
                </div>
              </section>

              <section>
                <Header>Story &amp; Notes</Header>
                <div className="space-y-8">
                  <TextAreaField label="Our story" rows={5} value={form.story} onChange={(v) => set("story", v)} placeholder="Tell your guests what this moment means…" />
                  <TextAreaField label="Extra notes (Details section)" rows={3} value={form.detailsNote} onChange={(v) => set("detailsNote", v)} placeholder="Parking at the 5th St garage. Shuttle departs the hotel lobby at 4:15." hint="Rendered as a quiet block under the detail cards" />
                  <TextAreaField label="RSVP note" rows={2} value={form.rsvpNote} onChange={(v) => set("rsvpNote", v)} placeholder="Kindly respond by May 1st." />
                  <SelectField label="Max guests per response" value={form.rsvpMaxGuests} onChange={(v) => set("rsvpMaxGuests", v)} options={[1,2,3,4,5,6,7,8,9,10].map((n)=>({value:String(n),label:String(n)}))} />
                </div>
              </section>
            </>
          )}

          {tab === "layout" && (
            <>
              <section>
                <Header>Section order</Header>
                <p className="mt-2 mb-8 text-xs text-[#F2F0ED]/40 max-w-md">
                  The public page renders top to bottom exactly in this order.
                  Hidden sections are skipped and the sticky RSVP button disappears
                  when RSVP is off.
                </p>
                <div className="space-y-3">
                  {form.sections.map((s, idx) => (
                    <div
                      key={s.id}
                      className={`border rounded-sm p-5 transition-opacity ${
                        s.visible ? "border-white/10" : "border-white/5 opacity-55"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col -my-1">
                          <button
                            onClick={() => moveSection(idx, -1)}
                            disabled={idx === 0}
                            aria-label={`Move ${s.id} up`}
                            className="p-1 text-[#F2F0ED]/35 hover:text-[#C58A58] disabled:opacity-15 disabled:hover:text-[#F2F0ED]/35"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            onClick={() => moveSection(idx, 1)}
                            disabled={idx === form.sections.length - 1}
                            aria-label={`Move ${s.id} down`}
                            className="p-1 text-[#F2F0ED]/35 hover:text-[#C58A58] disabled:opacity-15 disabled:hover:text-[#F2F0ED]/35"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        <span className="font-serif-display text-lg text-[#F2F0ED] flex-1 first-letter:uppercase">
                          {s.id}
                        </span>
                        <VisibilityRow checked={s.visible} onChange={(v) => patchSection(s.id, { visible: v })} />
                      </div>
                      {s.visible && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <p className="mb-3 text-[9px] tracking-luxe-sm uppercase text-[#F2F0ED]/25">Appearance</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <OptionalColorField label="Background" value={form.sectionStyles[s.id]?.bgColor || ""} onChange={(v) => setSectionStyle(s.id, "bgColor", v)} inheritHint="Inherits panels color" />
                            <OptionalColorField label="Text" value={form.sectionStyles[s.id]?.textColor || ""} onChange={(v) => setSectionStyle(s.id, "textColor", v)} inheritHint="Auto-matched for readability" />
                            <OptionalColorField label="Accent" value={form.sectionStyles[s.id]?.accentColor || ""} onChange={(v) => setSectionStyle(s.id, "accentColor", v)} inheritHint="Inherits invitation accent" />
                          </div>
                        </div>
                      )}
                      {s.id !== "countdown" && s.visible && (
                        <div className="mt-4">
                          <Field
                            label="Eyebrow label"
                            value={s.label}
                            onChange={(v) => patchSection(s.id, { label: v })}
                            placeholder={SECTION_DEFAULT_EYEBROWS[s.id]}
                            hint={`Shown as the small caps kicker above the heading — blank uses “${SECTION_DEFAULT_EYEBROWS[s.id]}”`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <Header>Headings</Header>
                <p className="mt-2 mb-8 text-xs text-[#F2F0ED]/40 max-w-md">
                  Override the big display heading of each section. The last word is
                  rendered italic automatically. Leave blank for the built-in copy.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {["story", "details", "gallery", "rsvp"].map((id) => (
                    <Field
                      key={id}
                      label={`${id === "rsvp" ? "RSVP" : id} heading`}
                      value={form.headings[id] ?? ""}
                      onChange={(v) => setHeading(id, v)}
                      placeholder={DEFAULT_HEADINGS[id]}
                    />
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === "style" && (
            <>
              <section>
                <Header>Palettes</Header>
                <p className="mt-2 mb-8 text-xs text-[#F2F0ED]/40 max-w-md">
                  Quick-apply a curated palette, then fine-tune below. Keep the
                  background dark — light panels and the hero overlay derive their
                  contrast from it.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {STYLE_PRESETS.map((p) => {
                    const active =
                      form.accentColor === p.accentColor &&
                      form.backgroundColor === p.backgroundColor &&
                      form.theme.textColor === p.textColor;
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        className={`border rounded-sm p-4 text-left transition-colors ${
                          active ? "border-[#C58A58]" : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        <div className="flex gap-1.5 mb-3">
                          {[p.backgroundColor, p.accentColor, p.textColor].map((c) => (
                            <span key={c} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} />
                          ))}
                        </div>
                        <span className="text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/70">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <Header>Colors</Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ColorField label="Accent Color" value={form.accentColor} onChange={(v) => set("accentColor", v)} />
                  <ColorField label="Background Color" value={form.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
                  <ColorField label="Panels Color" value={form.theme.paperColor} onChange={(v) => setTheme("paperColor", v)} hint="Backdrop of Countdown / Story / Details / Gallery sections" />
                  <ColorField label="Text Color (dark sections)" value={form.theme.textColor} onChange={(v) => setTheme("textColor", v)} hint="Body & input color on dark panels like the hero and RSVP" />
                  <SelectField
                    label="Display typeface"
                    value={form.theme.displayFont}
                    onChange={(v) => setTheme("displayFont", v)}
                    options={[
                      { value: "serif", label: "Editorial Serif (Cormorant)" },
                      { value: "sans", label: "Modern Sans (Manrope)" },
                    ]}
                    hint="Applies to display headings across the public page"
                  />
                </div>
              </section>
            </>
          )}

          {tab === "media" && (
            <>
              <section>
                <Header>Imagery</Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <ImageField label="Hero Image" value={form.heroImage} onChange={(v) => set("heroImage", v)} />
                  <ImageField label="Story Image" value={form.storyImage} onChange={(v) => set("storyImage", v)} />
                </div>
              </section>

              <section>
                <Header>Gallery</Header>
                <div className="space-y-4">
                  {form.gallery.map((g, i) => (
                    <div key={i} className="flex flex-col md:flex-row gap-4 p-4 border border-white/10 rounded-sm">
                      <div className="md:w-40 flex-shrink-0">
                        <ImageField label={`Photo ${i + 1}`} value={g.url} onChange={(v) => updateGallery(i, { url: v })} />
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Alt Text" value={g.alt} onChange={(v) => updateGallery(i, { alt: v })} placeholder="Describe the photo" />
                        <label className="block">
                          <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">Span</span>
                          <select
                            value={g.span}
                            onChange={(e) => updateGallery(i, { span: e.target.value })}
                            className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED]"
                          >
                            <option value="wide" className="bg-[#141414]">Wide</option>
                            <option value="tall" className="bg-[#141414]">Tall</option>
                          </select>
                        </label>
                      </div>
                      <button
                        onClick={() => removeGallery(i)}
                        className="self-start text-[#F2F0ED]/40 hover:text-[#C58A58] transition-colors p-2"
                        aria-label="Remove photo"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addGallery}
                    className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-5 py-3 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors"
                  >
                    <Plus size={14} /> Add gallery photo
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Publish sidebar */}
        <aside className="lg:sticky lg:top-24 self-start space-y-8">
          <div>
            <Header>Publish</Header>
            <Field
              label="URL Slug"
              value={form.slug}
              onChange={(v) => set("slug", v.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="john-jane"
            />
            <p className="mt-2 text-[11px] text-[#F2F0ED]/40 break-all">
              momenti.co/{form.slug || "slug"}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {recordId && form.slug ? (
              <a
                href={`/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#C58A58]/50 text-[#C58A58] py-4 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
              >
                Preview live page ↗
              </a>
            ) : (
              <p className="text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/30 py-4 border border-dashed border-white/10 text-center">
                Save once to unlock preview
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] py-4 hover:bg-[#d89a68] transition-colors disabled:opacity-50"
            >
              <Save size={14} /> {saving ? "Saving…" : recordId ? "Save changes" : "Create invitation"}
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center gap-2 text-xs tracking-luxe-sm uppercase border border-white/15 text-[#F2F0ED]/70 py-4 hover:border-white/40 transition-colors"
            >
              <ArrowLeft size={14} /> Cancel
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
