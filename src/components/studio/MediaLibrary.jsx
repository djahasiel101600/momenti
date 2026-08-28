import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/client";
import { X, RefreshCw, Loader2 } from "lucide-react";

/**
 * Modal "media library": browse media the host has already uploaded (from
 * the authenticated /api/uploads endpoint) and pick one by URL. Used by the
 * studio image/audio fields so guests/hosts can reuse prior uploads instead
 * of re-uploading.
 */
export default function MediaLibrary({ open, onClose, onSelect, kinds = ["image", "video"] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError("");
    try {
      const all = await base44.entities.Upload.list();
      setItems((all || []).filter((u) => kinds.includes(u.kind)));
    } catch (e) {
      setError(e?.message || "Could not load the media library.");
    } finally {
      setLoading(false);
    }
  }, [open, kinds]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#141414] border border-white/10 rounded-sm w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[#C58A58]">Media library</p>
            <p className="text-xs text-[#F2F0ED]/40 mt-1">
              Previously uploaded{kinds.length ? ` · ${kinds.join(" / ")}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              aria-label="Refresh"
              className="text-[#F2F0ED]/50 hover:text-[#C58A58] transition-colors p-1"
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={onClose} aria-label="Close" className="text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-[#F2F0ED]/50">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : error ? (
            <div className="py-24 text-center">
              <p className="text-sm text-red-300/80">{error}</p>
              <button
                onClick={load}
                className="mt-5 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-24 text-center text-sm text-[#F2F0ED]/40">
              Nothing here yet — upload some media first.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((u) => (
                <button
                  key={u.name}
                  onClick={() => {
                    onSelect(u.url);
                    onClose();
                  }}
                  className="group relative aspect-square rounded-sm overflow-hidden border border-white/10 hover:border-[#C58A58] transition-colors bg-white/5"
                  title={u.original_name || u.name}
                >
                  {u.kind === "video" ? (
                    <video src={u.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <img src={u.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  <span className="absolute bottom-1 right-1 text-[8px] tracking-luxe-sm uppercase px-1.5 py-0.5 bg-black/60 text-[#F2F0ED]/70">
                    {u.kind}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
