import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/client";
import { ArrowLeft, Eye, Users, Calendar, TrendingUp } from "lucide-react";

const DAYS_OPTIONS = [7, 30, 90];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function BarChart({ series, dataKey = "views" }) {
  if (!series || series.length === 0) {
    return <p className="text-[#F2F0ED]/40 text-sm">No data yet.</p>;
  }
  const max = Math.max(...series.map((d) => d[dataKey] || 0), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {series.map((d, i) => {
        const v = d[dataKey] || 0;
        const pct = (v / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#0A0A0A] border border-white/10 text-[10px] text-[#F2F0ED] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
              {formatDate(d.date)}: {v} {dataKey === "views" ? "views" : "guests"}
            </div>
            <div
              className="w-full bg-[#C58A58]/80 hover:bg-[#C58A58] transition-colors rounded-t-sm min-h-[2px]"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function InvitationAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.analytics.fetch(id, days);
      setData(res);
    } catch (e) {
      setError(e?.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, days]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#C58A58] transition-colors"
            >
              <ArrowLeft size={14} /> Back to studio
            </Link>
            <span className="text-[#F2F0ED]/20">|</span>
            <span className="font-serif-display text-xl">
              {data?.slug || "Invitation"}<span className="text-[#C58A58]">.</span>
            </span>
          </div>
          <Link
            to="/studio"
            className="text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
          >
            Back to studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] tracking-luxe uppercase text-[#C58A58]">Analytics</p>
            <h1 className="font-serif-display text-4xl md:text-5xl mt-2">Page views.</h1>
            <p className="mt-3 text-sm text-[#F2F0ED]/50 max-w-md">
              How many unique guests have opened your invitation, day by day. Views are anonymized and deduplicated per guest per day.
            </p>
          </div>
          <div className="flex items-center gap-1 border border-white/10 rounded-sm overflow-hidden">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-xs tracking-luxe-sm uppercase px-4 py-2.5 transition-colors ${
                  days === d
                    ? "bg-[#C58A58] text-[#0A0A0A]"
                    : "text-[#F2F0ED]/60 hover:text-[#F2F0ED]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-[#F2F0ED]/40">Loading…</p>
        ) : error ? (
          <div className="text-center py-24 border border-dashed border-white/15 rounded-sm">
            <p className="font-serif-display text-2xl text-[#F2F0ED]/80">{error}</p>
            <button
              onClick={load}
              className="mt-6 inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-5 py-2.5 hover:bg-[#d89a68] transition-colors"
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="border border-white/10 rounded-sm p-5">
                <div className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[#F2F0ED]/50 mb-2">
                  <Eye size={14} /> Total views
                </div>
                <p className="font-serif-display text-3xl">{formatNumber(data.total_views)}</p>
              </div>
              <div className="border border-white/10 rounded-sm p-5">
                <div className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[#F2F0ED]/50 mb-2">
                  <Users size={14} /> Unique guests
                </div>
                <p className="font-serif-display text-3xl">
                  {formatNumber(data.series?.reduce((a, d) => a + (d.unique_guests || 0), 0))}
                </p>
              </div>
              <div className="border border-white/10 rounded-sm p-5">
                <div className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[#F2F0ED]/50 mb-2">
                  <Calendar size={14} /> Window
                </div>
                <p className="font-serif-display text-3xl">
                  {data.days}<span className="text-lg text-[#F2F0ED]/50 ml-1">days</span>
                </p>
              </div>
            </div>

            <div className="border border-white/10 rounded-sm p-6 mb-4">
              <div className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[#F2F0ED]/50 mb-4">
                <TrendingUp size={14} /> Daily views
              </div>
              <BarChart series={data.series} dataKey="views" />
              <div className="flex justify-between mt-2 text-[10px] text-[#F2F0ED]/30">
                <span>{formatDate(data.series?.[0]?.date)}</span>
                <span>{formatDate(data.series?.[data.series.length - 1]?.date)}</span>
              </div>
            </div>

            <div className="border border-white/10 rounded-sm p-6">
              <div className="flex items-center gap-2 text-[10px] tracking-luxe uppercase text-[#F2F0ED]/50 mb-4">
                <Users size={14} /> Unique guests per day
              </div>
              <BarChart series={data.series} dataKey="unique_guests" />
              <div className="flex justify-between mt-2 text-[10px] text-[#F2F0ED]/30">
                <span>{formatDate(data.series?.[0]?.date)}</span>
                <span>{formatDate(data.series?.[data.series.length - 1]?.date)}</span>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}