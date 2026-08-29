import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Database,
  FileText,
  Loader2,
  PackageCheck,
} from "lucide-react";

function php(cents) {
  if (cents === null || cents === undefined) return "";
  return "₱" + (Number(cents) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMb(mb) {
  if (!mb) return "0 MB";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function Meter({ label, used, max, format }) {
  const ratio = max ? Math.min(100, Math.round(((used || 0) / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="uppercase tracking-luxe-sm text-[#F2F0ED]/50">{label}</span>
        <span className="text-[#F2F0ED]/60">
          {format ? format(used) : used} / {format ? format(max) : max}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${ratio >= 100 ? "bg-[#C58A58]" : "bg-[#C58A58]/70"}`}
          style={{ width: `${Math.max(ratio, used > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export default function Billing() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await base44.billing.usage());
    } catch (e) {
      setError(e?.message || "Could not load billing information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sub = data?.subscription;
  const onPaidPlan = sub?.status === "active" && sub?.plan && sub.plan !== "free";
  const currentPlan = data?.plan || {};
  const usage = data?.usage || {};
  const plans = data?.plans || [];
  const paymongo = data?.billing || {};

  // After a successful PayMongo redirect the webhook can take a few seconds to
  // land — poll the usage endpoint until the plan switches, then stop.
  useEffect(() => {
    if (status !== "success" || onPaidPlan) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await base44.billing.usage();
        const freshSub = fresh?.subscription;
        if (freshSub?.status === "active" && freshSub?.plan && freshSub.plan !== "free") {
          setData(fresh);
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [status, onPaidPlan]);

  const startCheckout = async (code) => {
    setBusy(code);
    try {
      const { checkout_url } = await base44.billing.checkout(code);
      if (!checkout_url) throw new Error("PayMongo did not return a checkout URL.");
      window.location.assign(checkout_url);
    } catch (e) {
      toast({
        title: "Checkout failed",
        description: e?.message || "Try again shortly.",
        variant: "destructive",
      });
      setBusy("");
    }
  };

  const cancelRenewal = async () => {
    setBusy("cancel");
    try {
      await base44.billing.cancel();
      toast({
        title: "Renewal canceled",
        description: "Your plan stays active until the period ends.",
      });
      await load();
    } catch (e) {
      toast({ title: "Could not cancel", description: e?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED]">
      <header className="border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/60 hover:text-[#F2F0ED] transition-colors"
          >
            <ArrowLeft size={14} /> Back to studio
          </Link>
          <span className="font-serif-display text-2xl tracking-luxe-sm lowercase">
            momenti<span className="text-[#C58A58]">.</span>co
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-12">
        <p className="text-[10px] tracking-luxe uppercase text-[#C58A58]">Billing</p>
        <h1 className="font-serif-display text-4xl md:text-5xl mt-2">Your plan.</h1>

        {status === "success" && !onPaidPlan && (
          <div className="mt-8 border border-[#C58A58]/50 text-[#C58A58] rounded-sm px-5 py-4 text-sm">
            Payment received — activating your plan… (this can take a few seconds).
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center text-[#F2F0ED]/40">
            <Loader2 size={20} className="mx-auto animate-spin" />
            <p className="mt-3 text-sm">Checking your plan…</p>
          </div>
        ) : error ? (
          <div className="border border-dashed border-white/10 rounded-sm py-20 text-center">
            <p className="text-sm text-[#F2F0ED]/50">{error}</p>
            <button
              onClick={load}
              className="mt-6 text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-10">
            {paymongo.mode === "test" && (
              <p className="text-[10px] tracking-luxe uppercase border border-[#F2F0ED]/15 text-[#F2F0ED]/40 px-3 py-2 inline-block mb-8">
                Test mode — payments are simulated
              </p>
            )}

            <section className="grid md:grid-cols-2 gap-6">
              <div className="border border-white/10 rounded-sm p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] tracking-luxe uppercase text-[#F2F0ED]/40 flex items-center gap-2">
                    <PackageCheck size={13} /> Current plan
                  </div>
                  {!onPaidPlan && (
                    <span className="text-[9px] tracking-luxe uppercase text-[#C58A58]">
                      free
                    </span>
                  )}
                </div>
                <p className="font-serif-display text-3xl mt-4">{currentPlan.name || "Free"}</p>
                <p className="text-xs text-[#F2F0ED]/50 mt-1">
                  {php(currentPlan.price_cents)}
                  {currentPlan.price_cents > 0 && currentPlan.billing_period === "month"
                    ? " / month"
                    : ""}
                  {currentPlan.features?.hide_branding && " · no momenti branding"}
                </p>
                {onPaidPlan ? (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs text-[#F2F0ED]/50">
                      {sub.cancel_at_period_end
                        ? "Renewals are canceled — your plan runs until the period ends."
                        : `Renews ${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "automatically"}.`}
                    </p>
                    <button
                      onClick={cancelRenewal}
                      disabled={!!busy}
                      className="text-[10px] tracking-luxe-sm uppercase border border-[#F2F0ED]/20 text-[#F2F0ED]/60 px-4 py-2.5 hover:border-[#C58A58] hover:text-[#C58A58] transition-colors disabled:opacity-40"
                    >
                      {busy === "cancel" ? "Working…" : "Cancel renewals"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-6 text-xs text-[#F2F0ED]/40">
                    You're on the free tier — upgrade anytime to unlock more invitations and media.
                  </p>
                )}
              </div>

              <div className="border border-white/10 rounded-sm p-6 space-y-6">
                <div className="text-[9px] tracking-luxe uppercase text-[#F2F0ED]/40 flex items-center gap-2">
                  <Database size={13} /> Usage
                </div>
                <Meter
                  label="Invitations"
                  used={usage.invitations}
                  max={usage.invitations_max}
                />
                <Meter
                  label="Media storage"
                  used={usage.storage_bytes}
                  max={usage.storage_max_bytes}
                  format={(v) => {
                    const mb = (v || 0) / (1024 * 1024);
                    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
                  }}
                />
              </div>
            </section>
            <section className="mt-12">
              <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-4">
                Plans
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                {plans.map((p) => {
                  const isCurrent = sub?.plan === p.code || (!sub && p.code === "free");
                  return (
                    <div key={p.code} className="border border-white/10 rounded-sm p-6 flex flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="font-serif-display text-2xl">{p.name}</h3>
                        <span className="text-xs text-[#F2F0ED]/60">
                          {php(p.price_cents)}
                          {p.price_cents > 0 ? ` / ${p.billing_period}` : ""}
                        </span>
                      </div>
                      <ul className="mt-5 space-y-2 text-xs text-[#F2F0ED]/60">
                        <li className="flex items-center gap-2">
                          <Check size={12} className="text-[#C58A58]" />
                          {p.limits?.max_invitations ?? "Unlimited"} invitation{p.limits?.max_invitations === 1 ? "" : "s"}
                        </li>
                        <li className="flex items-center gap-2">
                          <Check size={12} className="text-[#C58A58]" />
                          {formatMb(p.limits?.max_storage_mb)} of media
                        </li>
                        {p.features?.hide_branding && (
                          <li className="flex items-center gap-2">
                            <Check size={12} className="text-[#C58A58]" />
                            No momenti branding
                          </li>
                        )}
                      </ul>
                      <div className="mt-6 flex-1 flex items-end">
                        {isCurrent ? (
                          <span className="inline-block text-[10px] tracking-luxe-sm uppercase border border-[#F2F0ED]/15 text-[#F2F0ED]/40 px-4 py-2.5">
                            {sub?.provider === "paymongo" ? "Active" : "Current"}
                          </span>
                        ) : p.price_cents <= 0 ? (
                          <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/30">
                            Contact support to switch
                          </span>
                        ) : (
                          <button
                            onClick={() => startCheckout(p.code)}
                            disabled={!!busy || !paymongo.configured}
                            className="inline-flex items-center gap-2 text-[10px] tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-5 py-2.5 hover:bg-[#d89a68] transition-colors disabled:opacity-40"
                          >
                            <CreditCard size={13} />
                            {busy === p.code
                              ? "Opening PayMongo…"
                              : paymongo.configured
                                ? "Upgrade"
                                : "Coming soon"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-xs text-[#F2F0ED]/30 flex items-center gap-2">
                <FileText size={13} /> Payments are processed by PayMongo (GCash, Maya, cards). You'll be taken to their secure checkout.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}