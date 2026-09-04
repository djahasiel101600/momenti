import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/client";
import { Image } from "@/components/ui/image";
import { slugify } from "@/lib/templates";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "built-in", label: "Built-in" },
  { id: "community", label: "Community" },
];

export default function TemplateGallery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(null);
  const [existingSlugs, setExistingSlugs] = useState([]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = filter === "all" ? "" : filter;
      const res = await base44.templates.list(qs);
      setTemplates(res?.templates || []);
    } catch (e) {
      setError(e?.message || "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.Invitation.list();
        const list = res?.data || res?.items || res || [];
        setExistingSlugs((Array.isArray(list) ? list : []).map((r) => r.slug).filter(Boolean));
      } catch {
        // Non-fatal.
      }
    })();
  }, []);

  async function handleImport(template) {
    setImporting(template.slug);
    setError("");
    try {
      const detail = await base44.templates.get(template.slug);
      const payload = detail?.payload || {};
      const base = slugify(payload.couple || template.name || "imported") || "imported";
      const taken = new Set(existingSlugs.map((s) => String(s || "").toLowerCase()));
      let slug = base;
      let n = 2;
      while (taken.has(slug)) {
        slug = n === 2 ? `${base}-copy` : `${base}-copy-${n - 1}`;
        n += 1;
      }
      const record = await base44.entities.Invitation.create({ ...payload, slug });
      // Studio is state-driven (there is no /studio/edit route): hand the new
      // record to /studio via ?edit=<id>, which opens the editor once the
      // list has loaded.
      const editId = record?.id || record?.slug || "";
      navigate(editId ? `/studio?edit=${encodeURIComponent(editId)}` : "/studio");
    } catch (e) {
      setError(e?.message || "Failed to import template.");
      setImporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <button
              onClick={() => navigate("/studio")}
              className="text-xs tracking-luxe uppercase text-[#F2F0ED]/50 hover:text-[#F2F0ED] transition-colors"
            >
              ← Back to Studio
            </button>
            <h1 className="mt-4 font-serif-display text-4xl md:text-5xl">
              Template Gallery
            </h1>
            <p className="mt-3 text-sm text-[#F2F0ED]/60 max-w-lg">
              Browse built-in designs and community-shared themes. Import any template to start editing it as your own.
            </p>
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 text-xs tracking-luxe uppercase rounded-sm border transition-colors ${
                  filter === f.id
                    ? "border-[#F2F0ED] text-[#F2F0ED]"
                    : "border-[#F2F0ED]/20 text-[#F2F0ED]/50 hover:border-[#F2F0ED]/40"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-8 p-4 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-16 flex justify-center">
            <div className="w-8 h-8 border-2 border-[#F2F0ED]/20 border-t-[#F2F0ED] rounded-full animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <p className="mt-16 text-center text-sm text-[#F2F0ED]/40">
            No templates yet. Be the first to share a design!
          </p>
        ) : (
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t) => (
              <div
                key={t.slug}
                className="group relative border border-[#F2F0ED]/10 rounded-sm overflow-hidden hover:border-[#F2F0ED]/30 transition-colors"
              >
                <div
                  className="relative aspect-[3/4] overflow-hidden cursor-pointer"
                  onClick={() => setPreview(t)}
                >
                  <Image
                    src={t.cover || "/media/a2a00eea3_generated_131f7848.png"}
                    alt={`${t.name} template cover`}
                    fittingType="fill"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/80 via-transparent to-transparent" />
                  <span
                    className="absolute top-4 left-4 text-[10px] tracking-luxe uppercase px-2 py-1 rounded-sm"
                    style={
                      t.source === "built-in"
                        ? { backgroundColor: "#0A0A0A66", color: "#F2F0EDCC" }
                        : { backgroundColor: (t.accentColor || "#C58A58") + "33", color: t.accentColor || "#C58A58" }
                    }
                  >
                    {t.source === "built-in" ? "Built-in" : "Community"}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif-display text-xl">{t.name}</h3>
                      {t.tagline && (
                        <p className="mt-1 text-xs text-[#F2F0ED]/50">{t.tagline}</p>
                      )}
                    </div>
                    {t.accentColor && (
                      <span className="w-4 h-4 rounded-full shrink-0 mt-1" style={{ background: t.accentColor }} />
                    )}
                  </div>
                  <button
                    onClick={() => handleImport(t)}
                    disabled={importing === t.slug}
                    className="mt-5 w-full py-2.5 text-xs tracking-luxe uppercase bg-[#F2F0ED] text-[#0A0A0A] rounded-sm hover:bg-[#F2F0ED]/90 transition-colors disabled:opacity-50"
                  >
                    {importing === t.slug ? "Importing…" : "Use this template"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
