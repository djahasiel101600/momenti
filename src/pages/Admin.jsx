import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  LayoutDashboard,
  Users,
  Database,
  Settings,
  ScrollText,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Ban,
  CheckCircle2,
  ArrowLeft,
  Palette,
  Search,
} from "lucide-react";

function formatMoney(cents) {
  return `₱${((cents || 0) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="p-4 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300">
      {message}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs tracking-luxe-sm uppercase border-b-2 transition-colors ${
        active
          ? "border-[#C58A58] text-[#C58A58]"
          : "border-transparent text-[#F2F0ED]/50 hover:text-[#F2F0ED]"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "customers", label: "Customers", icon: Users },
  { key: "branding", label: "White-label", icon: Palette },
  { key: "database", label: "Database", icon: Database },
  { key: "config", label: "Config", icon: Settings },
  { key: "logs", label: "Logs", icon: ScrollText },
];

// --- Tabs ---------------------------------------------------------------------

function OverviewTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await base44.admin.overview());
    } catch (e) {
      setError(e?.message || "Could not load overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <p className="text-[#F2F0ED]/40 text-sm">Loading…</p>;
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-serif-display text-2xl">At a glance</h2>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <ErrorBanner message={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              ["Customers", data.counts.users],
              ["Invitations", data.counts.invitations],
              ["RSVPs", data.counts.rsvps],
              ["Uploads", data.counts.uploads],
              ["Storage", formatBytes(data.counts.storage_bytes)],
              ["Plans", data.counts.plans],
              ["Active subs", data.counts.active_subscriptions],
              ["Pending checkouts", data.counts.pending_checkouts],
              ["Paid volume", formatMoney(data.counts.paid_checkout_amount_cents)],
              ["Users w/ invites", data.counts.users_with_invitations],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/10 rounded-sm p-4">
                <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</p>
                <p className="font-serif-display text-2xl mt-2 break-words">{value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[#C58A58] mb-3">Newest customers</p>
            <div className="border border-white/10 rounded-sm divide-y divide-white/5">
              {data.recent_users.map((u) => (
                <div key={u.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="break-words min-w-0">{u.email}</span>
                  <span className="text-[#F2F0ED]/40 text-xs">{u.role || "member"}</span>
                  <span className="text-[#F2F0ED]/40 text-xs ml-auto">{formatDate(u.created_date)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CustomersTab({ me }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async (q) => {
    setLoading(true);
    setError("");
    try {
      const data = await base44.admin.users({ search: q || undefined, limit: 100 });
      setUsers(data.users || []);
      setTotal(data.total ?? (data.users || []).length);
    } catch (e) {
      setError(e?.message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  const patch = async (u, body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await base44.admin.updateUser(u.id, body);
      toast({ title: "Updated", description: `${u.email} saved.` });
      load(search);
    } catch (e) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif-display text-2xl mr-auto">
          Customers <span className="text-[#F2F0ED]/40 text-base">({total})</span>
        </h2>
        <div className="flex items-center border border-white/15 rounded-sm">
          <span className="pl-3 text-[#F2F0ED]/40">
            <Search size={13} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search)}
            placeholder="Search email or name…"
            className="bg-transparent text-sm px-3 py-2 outline-none placeholder:text-[#F2F0ED]/30 w-56"
          />
          <button
            onClick={() => load(search)}
            className="text-xs uppercase tracking-luxe-sm px-3 py-2 text-[#C58A58] hover:text-[#d89a68]"
          >
            Go
          </button>
        </div>
      </div>
      <ErrorBanner message={error} />
      {loading && users.length === 0 ? (
        <p className="text-[#F2F0ED]/40 text-sm">Loading…</p>
      ) : (
        <div className="border border-white/10 rounded-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 border-b border-white/10">
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Role</th>
                <th className="px-4 py-3 font-normal">Invites</th>
                <th className="px-4 py-3 font-normal">Subs</th>
                <th className="px-4 py-3 font-normal">Joined</th>
                <th className="px-4 py-3 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => {
                const isSelf = me && u.email === me.email;
                const isAdminUser = u.role === "admin" || u.is_staff;
                return (
                  <tr key={u.id} className="align-top">
                    <td className="px-4 py-3 break-words max-w-[220px]">
                      {u.email}
                      {isSelf && <span className="text-[#C58A58] text-xs"> (you)</span>}
                      {!u.is_active && (
                        <span className="ml-2 text-[10px] uppercase tracking-luxe-sm text-red-400/80">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#F2F0ED]/60">{u.full_name || "—"}</td>
                    <td className="px-4 py-3">
                      {isAdminUser ? (
                        <span className="text-[#C58A58]">admin</span>
                      ) : (
                        <span className="text-[#F2F0ED]/50">member</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#F2F0ED]/60">{u.invite_count ?? 0}</td>
                    <td className="px-4 py-3 text-[#F2F0ED]/60">{u.subscription_count ?? 0}</td>
                    <td className="px-4 py-3 text-[#F2F0ED]/60 whitespace-nowrap">{formatDate(u.created_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {isAdminUser ? (
                          <button
                            disabled={isSelf}
                            onClick={() =>
                              patch(u, { role: "member" }, `Revoke admin access for ${u.email}?`)
                            }
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-red-400 disabled:opacity-30 disabled:hover:text-[#F2F0ED]/60 transition-colors"
                            title={isSelf ? "You cannot revoke your own admin access" : "Revoke admin"}
                          >
                            <ShieldOff size={12} /> Demote
                          </button>
                        ) : (
                          <button
                            onClick={() => patch(u, { role: "admin" }, `Grant admin access to ${u.email}?`)}
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
                          >
                            <ShieldCheck size={12} /> Make admin
                          </button>
                        )}
                        {u.is_active ? (
                          <button
                            disabled={isSelf}
                            onClick={() => patch(u, { is_active: false }, `Deactivate ${u.email}?`)}
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-red-400 disabled:opacity-30 disabled:hover:text-[#F2F0ED]/60 transition-colors"
                            title={isSelf ? "You cannot deactivate yourself" : "Deactivate"}
                          >
                            <Ban size={12} /> Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => patch(u, { is_active: true })}
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-green-400 transition-colors"
                          >
                            <CheckCircle2 size={12} /> Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#F2F0ED]/40">
                    No customers match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DatabaseTab() {
  const [tables, setTables] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await base44.admin.database();
      setTables(data.tables || []);
    } catch (e) {
      setError(e?.message || "Could not load database info.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif-display text-2xl">Database tables</h2>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="border border-white/10 rounded-sm divide-y divide-white/5">
        {tables.map((t) => (
          <div key={t.name} className="px-4 py-3 flex items-center gap-4 text-sm">
            <span className="font-mono text-xs text-[#C58A58] break-all">{t.name}</span>
            {t.label !== t.name && <span className="text-xs text-[#F2F0ED]/40">{t.label}</span>}
            <span className="ml-auto text-[#F2F0ED]/60 whitespace-nowrap">
              {t.rows === null || t.rows === undefined ? "—" : `${t.rows.toLocaleString()} rows`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigTab() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await base44.admin.config();
      setConfig(data.config || {});
    } catch (e) {
      setError(e?.message || "Could not load config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !config) return <p className="text-[#F2F0ED]/40 text-sm">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif-display text-2xl">Runtime config</h2>
          <p className="text-xs text-[#F2F0ED]/40 mt-1">
            Live MOMENTI_* values — secrets are redacted server-side.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="border border-white/10 rounded-sm divide-y divide-white/5">
        {config &&
          Object.entries(config).map(([key, value]) => (
            <div key={key} className="px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-mono text-xs text-[#C58A58] break-all">{key}</span>
              <span className="ml-auto font-mono text-xs text-[#F2F0ED]/70 break-all text-right">
                {value === null ? (
                  <em className="text-[#F2F0ED]/30 not-italic">unset</em>
                ) : value === "***" ? (
                  "••••••••"
                ) : Array.isArray(value) ? (
                  value.join(", ")
                ) : (
                  String(value)
                )}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await base44.admin.logs();
      setLogs(data.logs || []);
    } catch (e) {
      setError(e?.message || "Could not load logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [auto, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif-display text-2xl mr-auto">Log tail (last 200 lines)</h2>
        <button
          onClick={() => setAuto((v) => !v)}
          className={`text-xs uppercase tracking-luxe-sm px-3 py-2 border transition-colors ${
            auto
              ? "border-[#C58A58] text-[#C58A58]"
              : "border-white/15 text-[#F2F0ED]/60 hover:text-[#F2F0ED]"
          }`}
        >
          {auto ? "Auto 5s: on" : "Auto 5s: off"}
        </button>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-luxe-sm text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <ErrorBanner message={error} />
      <pre className="border border-white/10 rounded-sm p-4 text-xs font-mono text-[#F2F0ED]/70 whitespace-pre-wrap break-words max-h-[520px] overflow-y-auto bg-black/30">
        {logs.length ? logs.join("\n") : "No log lines captured yet."}
      </pre>
    </div>
  );
}

// --- White-label ----------------------------------------------------------------

const wlInputCls =
  "w-full bg-transparent border border-white/15 rounded-sm px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-accent,#C58A58)] placeholder:text-[#F2F0ED]/25 transition-colors";

function WlField({ label, value, onChange, placeholder, hint, type = "text" }) {
  return (
    <div>
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        {type === "color" && /^#[0-9a-fA-F]{6}$/.test(value) && (
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-sm border border-white/15 bg-transparent"
            aria-label={`${label} picker`}
          />
        )}
        <input
          type={type === "color" ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={wlInputCls}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-[#F2F0ED]/30">{hint}</p>}
    </div>
  );
}

function BrandingTab() {
  const { refreshAppSettings } = useAuth();
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({ business: {}, branding: {} });
  const [overrides, setOverrides] = useState({ business: {}, branding: {} });
  const [form, setForm] = useState({
    business: { name: "", tagLine: "", contactEmail: "", sampleLink: "", locations: "" },
    branding: { accentColor: "", accentHoverColor: "", logoUrl: "", faviconUrl: "" },
  });
  const [socials, setSocials] = useState([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await base44.admin.siteSettings();
      setDefaults(data.defaults || { business: {}, branding: {} });
      setOverrides(data.overrides || { business: {}, branding: {} });
      const s = data.settings || { business: {}, branding: {} };
      setForm({
        business: {
          name: s.business?.name || "",
          tagLine: s.business?.tagLine || "",
          contactEmail: s.business?.contactEmail || "",
          sampleLink: s.business?.sampleLink || "",
          locations: (s.business?.locations || []).join(", "),
        },
        branding: {
          accentColor: s.branding?.accentColor || "",
          accentHoverColor: s.branding?.accentHoverColor || "",
          logoUrl: s.branding?.logoUrl || "",
          faviconUrl: s.branding?.faviconUrl || "",
        },
      });
      setSocials((s.business?.socials || []).map((x) => ({ name: x.name, url: x.url })));
      setLoaded(true);
    } catch (e) {
      setError(e?.message || "Could not load site settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setBiz = (k, v) => setForm((f) => ({ ...f, business: { ...f.business, [k]: v } }));
  const setBrand = (k, v) => setForm((f) => ({ ...f, branding: { ...f.branding, [k]: v } }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.admin.updateSiteSettings({
        business: {
          name: form.business.name,
          tagLine: form.business.tagLine,
          contactEmail: form.business.contactEmail,
          sampleLink: form.business.sampleLink,
          locations: form.business.locations,
          socials: socials.filter((s) => s.name.trim() && s.url.trim()),
        },
        branding: form.branding,
      });
      await refreshAppSettings?.();
      toast({ title: "Saved", description: "White-label settings applied site-wide." });
      load();
    } catch (e) {
      setError(e?.message || "Could not save site settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!window.confirm("Remove all white-label overrides and fall back to the .env defaults?"))
      return;
    setSaving(true);
    setError("");
    try {
      await base44.admin.updateSiteSettings({ business: {}, branding: {} });
      await refreshAppSettings?.();
      toast({ title: "Reset", description: "Back to environment defaults." });
      load();
    } catch (e) {
      setError(e?.message || "Could not reset.");
    } finally {
      setSaving(false);
    }
  };

  // Hint text: shows whether a field is an admin override or still the env default.
  const hintFor = (group, key, fallbackLabel) => {
    if (overrides[group]?.[key]) return "Overridden — clear & save to use the env default";
    const d = defaults[group]?.[key];
    if (Array.isArray(d)) return d.length ? `${fallbackLabel}: ${d.join(", ")}` : fallbackLabel;
    if (d) return `${fallbackLabel}: ${d}`;
    return fallbackLabel;
  };

  if (!loaded) return <p className="text-[#F2F0ED]/40 text-sm">Loading…</p>;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-serif-display text-2xl">White-label</h2>
          <p className="text-xs text-[#F2F0ED]/40 mt-1 max-w-xl">
            Override business info and branding site-wide. Clear a field and save to fall back
            to its .env default.
          </p>
        </div>
        <button
          onClick={resetAll}
          disabled={saving}
          className="text-xs uppercase tracking-luxe-sm px-4 py-2.5 border border-white/15 text-[#F2F0ED]/60 hover:text-[#F2F0ED] hover:border-white/30 disabled:opacity-40 transition-colors"
        >
          Reset to env defaults
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[color:var(--brand-accent)] text-[#0A0A0A] px-5 py-2.5 hover:bg-[color:var(--brand-accent-hover)] disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : "Save & apply"}
        </button>
      </div>
      <ErrorBanner message={error} />
      <div className="grid md:grid-cols-2 gap-10">
        <div className="space-y-5">
          <p className="text-[10px] tracking-luxe uppercase text-[color:var(--brand-accent)]">
            Business
          </p>
          <WlField
            label="Brand name"
            value={form.business.name}
            onChange={(v) => setBiz("name", v)}
            hint={hintFor("business", "name", "Env default")}
            placeholder="Moments Studio"
          />
          <WlField
            label="Tagline"
            value={form.business.tagLine}
            onChange={(v) => setBiz("tagLine", v)}
            hint={hintFor("business", "tagLine", "Env default")}
          />
          <WlField
            label="Contact email"
            value={form.business.contactEmail}
            onChange={(v) => setBiz("contactEmail", v)}
            hint={hintFor("business", "contactEmail", "Env default")}
          />
          <WlField
            label="Locations (comma-separated)"
            value={form.business.locations}
            onChange={(v) => setBiz("locations", v)}
            hint={hintFor("business", "locations", "Env default")}
          />
          <WlField
            label="Sample link (hero + template cards)"
            value={form.business.sampleLink}
            onChange={(v) => setBiz("sampleLink", v)}
            hint={hintFor("business", "sampleLink", "Env default")}
            placeholder="/studio"
          />
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">
                Social profiles
              </span>
              <button
                onClick={() => setSocials((s) => [...s, { name: "", url: "" }])}
                className="text-[10px] uppercase tracking-luxe-sm text-[color:var(--brand-accent)] hover:opacity-80"
              >
                + Add
              </button>
            </div>
            {socials.map((s, i) => (
              <div key={i} className="flex gap-2 mt-2">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setSocials((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Instagram"
                  className={wlInputCls}
                />
                <input
                  value={s.url}
                  onChange={(e) =>
                    setSocials((arr) => arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                  placeholder="https://…"
                  className={`${wlInputCls} flex-1`}
                />
                <button
                  onClick={() => setSocials((arr) => arr.filter((_, j) => j !== i))}
                  className="text-[#F2F0ED]/40 hover:text-red-400 px-2 transition-colors"
                  aria-label="Remove social"
                >
                  ×
                </button>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-[#F2F0ED]/30">
              {hintFor("business", "socials", "Env default")}
            </p>
          </div>
        </div>
        <div className="space-y-5">
          <p className="text-[10px] tracking-luxe uppercase text-[color:var(--brand-accent)]">
            Branding
          </p>
          <WlField
            type="color"
            label="Accent color"
            value={form.branding.accentColor}
            onChange={(v) => setBrand("accentColor", v)}
            hint={hintFor("branding", "accentColor", "Env default")}
            placeholder="#C58A58"
          />
          <WlField
            type="color"
            label="Accent hover color"
            value={form.branding.accentHoverColor}
            onChange={(v) => setBrand("accentHoverColor", v)}
            hint={hintFor("branding", "accentHoverColor", "Env default")}
            placeholder="#d89a68"
          />
          <WlField
            label="Logo URL (navbar)"
            value={form.branding.logoUrl}
            onChange={(v) => setBrand("logoUrl", v)}
            hint={hintFor("branding", "logoUrl", "Env default")}
            placeholder="https://…/logo.png"
          />
          <WlField
            label="Favicon URL"
            value={form.branding.faviconUrl}
            onChange={(v) => setBrand("faviconUrl", v)}
            hint={hintFor("branding", "faviconUrl", "Env default")}
          />
          <div className="border border-white/10 rounded-sm p-4">
            <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-3">Preview</p>
            <div
              className="inline-flex items-center gap-2 text-xs uppercase tracking-luxe-sm px-4 py-2 text-[#0A0A0A]"
              style={{ background: form.branding.accentColor || "#C58A58" }}
            >
              <ShieldCheck size={13} /> Accent preview
            </div>
            {form.branding.logoUrl && /^https?:\/\//.test(form.branding.logoUrl) && (
              <img src={form.branding.logoUrl} alt="Logo preview" className="mt-3 h-8 w-auto" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Page ---------------------------------------------------------------------

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState("overview");

  const isAdmin = !!user && (user.role === "admin" || user.is_staff);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link to="/" className="font-serif-display text-2xl tracking-luxe-sm lowercase">
            momenti<span className="text-[#C58A58]">.</span>co
          </Link>
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
          >
            <ArrowLeft size={14} /> Back to studio
          </Link>
        </div>
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 pb-8">
          <p className="text-[10px] tracking-luxe uppercase text-[#C58A58] inline-flex items-center gap-2">
            <ShieldCheck size={12} /> Administration
          </p>
          <h1 className="font-serif-display text-4xl md:text-5xl mt-2">Operations console.</h1>
          <p className="mt-3 text-sm text-[#F2F0ED]/50 max-w-md">
            Customers, database, runtime configuration and logs — staff access only.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-10">
        {!isAuthenticated || !user ? (
          <div className="p-4 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            You must be signed in. <Link to="/login" className="underline">Sign in</Link> with an
            administrator account.
          </div>
        ) : !isAdmin ? (
          <div className="p-4 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            Admin access required. Your account ({user.email}) is not an administrator.
          </div>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1 border-b border-white/10 mb-8">
              {TABS.map((t) => (
                <TabButton
                  key={t.key}
                  active={tab === t.key}
                  icon={t.icon}
                  label={t.label}
                  onClick={() => setTab(t.key)}
                />
              ))}
            </nav>
            {tab === "overview" && <OverviewTab />}
            {tab === "customers" && <CustomersTab me={user} />}
            {tab === "branding" && <BrandingTab />}
            {tab === "database" && <DatabaseTab />}
            {tab === "config" && <ConfigTab />}
            {tab === "logs" && <LogsTab />}
          </>
        )}
      </main>
    </div>
  );
}




