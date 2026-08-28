import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/client";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  MailX,
  Users,
  X,
} from "lucide-react";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Host-side RSVP dashboard: insight into who accepted, who declined and how
 * many guests are coming, per invitation. Responses load through the
 * authenticated API; the guest list is exportable as CSV.
 */
export default function RsvpDashboard() {
  const { id } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, responses] = await Promise.all([
        base44.entities.Invitation.get(id),
        base44.entities.Rsvp.list({ invitation: id }),
      ]);
      setInvitation(inv);
      setRsvps(responses || []);
    } catch (e) {
      setError(e?.message || "Could not load RSVP responses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const stats = useMemo(() => {
    const attending = rsvps.filter((r) => r.attending);
    return {
      responses: rsvps.length,
      attending: attending.length,
      declined: rsvps.length - attending.length,
      guests: attending.reduce((sum, r) => sum + (Number(r.guest_count) || 0), 0),
    };
  }, [rsvps]);

  const exportCsv = () => {
    const header = "Name,Email,Attending,Guests,Message,Responded At";
    const rows = rsvps.map((r) =>
      [
        r.name,
        r.email,
        r.attending ? "Accepts" : "Declines",
        r.guest_count,
        r.message || "",
        formatDate(r.created_date),
      ]
        .map(csvEscape)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rsvps-${invitation?.slug || id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: "Responses", value: stats.responses, icon: Users },
    { label: "Attending", value: stats.attending, icon: Check },
    { label: "Declined", value: stats.declined, icon: X },
    { label: "Total guests", value: stats.guests, icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors"
          >
            <ArrowLeft size={14} /> Studio
          </Link>
          <a href="/" className="font-serif-display text-2xl tracking-luxe-sm lowercase">
            momenti<span className="text-[#C58A58]">.</span>co
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-14">
        {loading ? (
          <div className="py-32 text-center text-sm tracking-luxe-sm uppercase text-[#F2F0ED]/40">
            Loading responses…
          </div>
        ) : error ? (
          <div className="py-32 text-center">
            <p className="text-sm text-red-300/80">{error}</p>
            <button
              onClick={load}
              className="mt-6 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <p className="text-[10px] tracking-luxe uppercase text-[#C58A58]">Guest ledger</p>
                <h1 className="font-serif-display text-3xl md:text-4xl mt-3">
                  {invitation?.couple || "Invitation"}
                </h1>
                <p className="text-xs text-[#F2F0ED]/50 mt-2">
                  {invitation?.eventType}
                  {invitation?.date ? ` · ${formatDate(invitation.date)}` : ""} · /{invitation?.slug}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={`/${invitation?.slug}`}
                  className="inline-flex items-center gap-2 text-[10px] tracking-luxe-sm uppercase text-[#C58A58] border-b border-[#C58A58]/40 pb-1 hover:border-[#C58A58] transition-colors"
                >
                  <ExternalLink size={12} /> View live page
                </Link>
                {rsvps.length > 0 && (
                  <button
                    onClick={exportCsv}
                    className="inline-flex items-center gap-2 text-[10px] tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-4 py-2.5 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
              {statCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="border border-white/10 rounded-sm p-6">
                  <div className="flex items-center gap-2 text-[#F2F0ED]/40">
                    <Icon size={13} />
                    <span className="text-[9px] tracking-luxe uppercase">{label}</span>
                  </div>
                  <p className="font-serif-display text-4xl mt-3">{value}</p>
                </div>
              ))}
            </div>

            <section className="mt-12">
              <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-4">
                Responses
              </p>
              {rsvps.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded-sm py-20 text-center">
                  <MailX size={22} className="mx-auto text-[#F2F0ED]/25" />
                  <p className="mt-4 text-sm text-[#F2F0ED]/50">No responses yet.</p>
                  <p className="mt-2 text-xs text-[#F2F0ED]/30">
                    Share momenti.co/{invitation?.slug} — every reply lands here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {rsvps.map((r) => (
                    <RsvpRow key={r.id} rsvp={r} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function RsvpRow({ rsvp: r }) {
  return (
    <li className="border border-white/10 rounded-sm p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-serif-display text-lg truncate">{r.name}</p>
        <p className="text-xs text-[#F2F0ED]/40 truncate">{r.email}</p>
        {r.message && (
          <p className="mt-2 text-xs text-[#F2F0ED]/50 italic border-l border-[#C58A58]/40 pl-3">
            “{r.message}”
          </p>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1.5 self-start md:self-center text-[9px] tracking-luxe-sm uppercase px-3 py-1.5 border ${
          r.attending
            ? "border-[#C58A58]/60 text-[#C58A58]"
            : "border-[#F2F0ED]/15 text-[#F2F0ED]/40"
        }`}
      >
        {r.attending ? <Check size={11} /> : <X size={11} />}
        {r.attending ? "Accepts" : "Declines"}
      </span>
      <div className="text-right md:w-28 flex-shrink-0">
        <p className="text-sm">
          {r.guest_count} {r.guest_count === 1 ? "guest" : "guests"}
        </p>
        <p className="text-[10px] text-[#F2F0ED]/30 mt-0.5">{formatDate(r.created_date)}</p>
      </div>
    </li>
  );
}
