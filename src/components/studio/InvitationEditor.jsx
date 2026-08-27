import { useState } from "react";
import { base44 } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import ImageField from "./ImageField";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
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
    </label>
  );
}

function Header({ children }) {
  return (
    <div className="mb-8">
      <span className="text-[10px] tracking-luxe uppercase text-[#C58A58]">{children}</span>
      <div className="mt-3 h-px w-12 bg-[#C58A58]/40" />
    </div>
  );
}

function ColorField({ label, value, onChange }) {
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

export default function InvitationEditor({ initial, recordId, onSaved, onCancel }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({
    slug: initial.slug || "",
    title: initial.title || "",
    template: initial.template || "wedding",
    couple: initial.couple || "",
    coupleShort: initial.coupleShort || "",
    eventType: initial.eventType || "",
    date: toLocalInput(initial.date),
    venueName: initial.venueName || "",
    venueAddress: initial.venueAddress || "",
    mapUrl: initial.mapUrl || "",
    time: initial.time || "",
    dressCode: initial.dressCode || "",
    story: initial.story || "",
    heroImage: initial.heroImage || "",
    storyImage: initial.storyImage || "",
    gallery: Array.isArray(initial.gallery) ? initial.gallery.map((g) => ({ ...g })) : [],
    accentColor: initial.accentColor || "#C58A58",
    backgroundColor: initial.backgroundColor || "#0A0A0A",
    countdownVisible: initial.countdownVisible !== false,
  }));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
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
      <div className="mb-10">
        <span className="text-[10px] tracking-luxe uppercase text-[#C58A58]">
          {recordId ? "Editing" : "New invitation"}
        </span>
        <h2 className="font-serif-display text-3xl md:text-4xl text-[#F2F0ED] mt-2">
          {form.couple || "Untitled"}
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
        <div className="space-y-16">
          {/* Event details */}
          <section>
            <Header>Event Details</Header>
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
              <Field label="Venue Name" value={form.venueName} onChange={(v) => set("venueName", v)} placeholder="The Grand Ballroom" />
              <Field label="Start Time" value={form.time} onChange={(v) => set("time", v)} placeholder="5:00 PM" />
              <Field label="Venue Address" value={form.venueAddress} onChange={(v) => set("venueAddress", v)} placeholder="123 Main St, New York, NY" />
              <Field label="Dress Code" value={form.dressCode} onChange={(v) => set("dressCode", v)} placeholder="Black Tie Optional" />
              <div className="md:col-span-2">
                <Field label="Map URL" value={form.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.google.com/..." />
              </div>
              <div className="md:col-span-2">
                <label className="block">
                  <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">Story / Welcome Note</span>
                  <textarea
                    value={form.story}
                    onChange={(e) => set("story", e.target.value)}
                    rows={5}
                    placeholder="Tell your guests what this moment means…"
                    className="mt-2 w-full bg-transparent border-b border-[#F2F0ED]/20 focus:border-[#C58A58] outline-none py-2.5 text-sm text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors resize-none"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Theme */}
          <section>
            <Header>Theme</Header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ColorField label="Accent Color" value={form.accentColor} onChange={(v) => set("accentColor", v)} />
              <ColorField label="Background Color" value={form.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
            </div>
            <label className="mt-8 flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.countdownVisible}
                onChange={(e) => set("countdownVisible", e.target.checked)}
                className="accent-[#C58A58] w-4 h-4"
              />
              <span className="text-sm text-[#F2F0ED]/70">Show countdown to the event</span>
            </label>
          </section>

          {/* Imagery */}
          <section>
            <Header>Imagery</Header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ImageField label="Hero Image" value={form.heroImage} onChange={(v) => set("heroImage", v)} />
              <ImageField label="Story Image" value={form.storyImage} onChange={(v) => set("storyImage", v)} />
            </div>
          </section>

          {/* Gallery */}
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
                        <option value="wide" className="bg-[#0A0A0A]">Wide</option>
                        <option value="tall" className="bg-[#0A0A0A]">Tall</option>
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