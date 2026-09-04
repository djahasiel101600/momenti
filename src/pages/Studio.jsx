import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Image } from "@/components/ui/image";
import { Plus, Pencil, Trash2, ExternalLink, ClipboardList, Upload, Download, CreditCard, BarChart3, LayoutGrid } from "lucide-react";
import { templateDefaults, templateName } from "@/lib/templates";
import { exportInvitation, parseInvitationImport } from "@/lib/invitationTransfer";
import TemplatePicker from "@/components/studio/TemplatePicker";
import InvitationEditor from "@/components/studio/InvitationEditor";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Studio() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await base44.entities.Invitation.list("-created_date", 50);
      setItems(list || []);
    } catch (e) {
      setItems([]);
      setError(e?.message || "Could not load your invitations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Deep link from the template gallery: /studio?edit=<id> opens the editor
  // for the freshly imported record once the list has loaded.
  useEffect(() => {
    if (loading || error || view !== "list" || editing) return;
    const editId = searchParams.get("edit");
    if (!editId) return;
    const item = items.find((it) => it.id === editId || it.slug === editId);
    if (item) {
      setSearchParams({}, { replace: true });
      startEdit(item);
    }
  }, [loading, error, items, view, editing, searchParams]);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await base44.entities.Invitation.delete(id);
      toast({ title: "Deleted", description: `${title} has been removed.` });
      load();
    } catch (e) {
      toast({ title: "Could not delete", variant: "destructive" });
    }
  };

  const startEdit = (item) => {
    setEditing({ recordId: item.id, initial: item });
    setView("edit");
  };

  const startNew = (templateId) => {
    setEditing({ recordId: null, initial: templateDefaults(templateId) });
    setView("edit");
  };

  const handleSaved = () => {
    setEditing(null);
    setView("list");
    load();
  };

  // --- Template sharing (import/export) ---------------------------------------

  const handleExport = (it) => {
    try {
      exportInvitation(it);
      toast({
        title: "Template exported",
        description: "Share the .json file — anyone can import it from their studio.",
      });
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseInvitationImport(text, items.map((it) => it.slug));
      setEditing({ recordId: null, initial: payload });
      setView("edit");
      toast({
        title: "Template imported",
        description: `Review it and save as “${payload.slug}”.`,
      });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not read that file.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 h-20 flex items-center justify-between">
          <a href="/" className="font-serif-display text-2xl tracking-luxe-sm lowercase">
            momenti<span className="text-[#C58A58]">.</span>co
          </a>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors">
              View site
            </Link>
            {view !== "list" ? (
              <button
                onClick={() => {
                  setEditing(null);
                  setView("list");
                }}
                className="text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
              >
                Back to studio
              </button>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-5 py-2.5 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors"
                >
                  <Upload size={14} /> Import
                </button>
                <Link
                  to="/studio/billing"
                  className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-5 py-2.5 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors"
                >
                  <CreditCard size={14} /> Billing
                </Link>
                <button
                  onClick={() => setView("pick")}
                  className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-5 py-2.5 hover:bg-[#d89a68] transition-colors"
                >
                  <Plus size={14} /> New invitation
                </button>
              </>
            )}
          </div>
        </div>
        {view === "list" && (
          <div className="mx-auto max-w-[1200px] px-6 lg:px-12 pb-8">
            <p className="text-[10px] tracking-luxe uppercase text-[#C58A58]">The Studio</p>
            <h1 className="font-serif-display text-4xl md:text-5xl mt-2">Craft each moment.</h1>
            <p className="mt-3 text-sm text-[#F2F0ED]/50 max-w-md">
              Build a fully customizable invitation from a template — edit the details, theme colors and imagery, then share its link.
            </p>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-12">
        {view === "list" &&
          (loading ? (
            <p className="text-[#F2F0ED]/40">Loading…</p>
          ) : error ? (
            <div className="p-4 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-24 border border-dashed border-white/15 rounded-sm">
              <p className="font-serif-display text-3xl text-[#F2F0ED]/80">No invitations yet</p>
              <p className="mt-3 text-sm text-[#F2F0ED]/40">Pick a template to craft your first one.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => setView("pick")}
                  className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-6 py-3 hover:bg-[#d89a68] transition-colors"
                >
                  <Plus size={14} /> New invitation
                </button>
                <Link
                  to="/studio/templates"
                  className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-white/20 text-[#F2F0ED]/70 px-6 py-3 hover:border-white/40 hover:text-[#F2F0ED] transition-colors"
                >
                  <LayoutGrid size={14} /> Browse gallery
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="group min-w-0 border border-white/10 rounded-sm overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {it.heroImage ? (
                      <Image src={it.heroImage} fittingType="fill" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/5" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
                    <span
                      className="absolute top-3 left-3 text-[10px] tracking-luxe uppercase px-2 py-1 bg-[#0A0A0A]/70 max-w-[75%] truncate"
                      style={{ color: it.accentColor }}
                    >
                      {templateName(it.template)}
                    </span>
                  </div>
                  <div className="p-5 flex flex-col flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-serif-display text-xl break-words">{it.couple}</h3>
                        <p className="text-xs text-[#F2F0ED]/50 mt-1 truncate">
                          {it.eventType} · {formatDate(it.date)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(it.id, it.title || it.couple)}
                        className="shrink-0 inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase px-2.5 py-1.5 border border-white/15 text-[#F2F0ED]/70 hover:text-red-400 hover:border-red-400/40 transition-colors"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Link
                        to={`/${it.slug}`}
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase text-[#C58A58] border-b border-[#C58A58]/40 pb-1 hover:border-[#C58A58] transition-colors"
                      >
                        <ExternalLink size={12} /> View
                      </Link>
                      <button
                        onClick={() => startEdit(it)}
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <Link
                        to={`/studio/rsvps/${it.id}`}
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
                      >
                        <ClipboardList size={12} /> RSVPs
                      </Link>
                      <Link
                        to={`/studio/analytics/${it.id}`}
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
                      >
                        <BarChart3 size={12} /> Views
                      </Link>
                      <button
                        onClick={() => handleExport(it)}
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors"
                        aria-label="Export as template file"
                      >
                        <Download size={12} /> Export
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {view === "pick" && <TemplatePicker onSelect={startNew} />}

        {view === "edit" && editing && (
          <InvitationEditor
            initial={editing.initial}
            recordId={editing.recordId}
            onSaved={handleSaved}
            onCancel={() => {
              setEditing(null);
              setView("list");
            }}
          />
        )}
      </main>
    </div>
  );
}