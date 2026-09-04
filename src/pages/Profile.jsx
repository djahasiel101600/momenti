import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  BadgeCheck,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  UserCircle,
} from "lucide-react";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const inputClass =
  "w-full bg-transparent border border-white/15 rounded-sm px-4 py-3 text-sm outline-none placeholder:text-[#F2F0ED]/30 focus:border-[#C58A58] transition-colors";
const labelClass = "block text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-2";

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { toast } = useToast();
  const [details, setDetails] = useState(null);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const isAdmin = !!user && (user.role === "admin" || user.is_staff);

  // Extra account facts the /me payload does not carry (verification, joined).
  useEffect(() => {
    let alive = true;
    base44.auth
      .getProfile()
      .then((d) => {
        if (alive) setDetails(d);
      })
      .catch(() => {
        /* non-blocking: the context user already covers the basics */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED] flex items-center justify-center px-6">
        <div className="p-6 rounded-sm border border-red-500/30 bg-red-500/10 text-sm text-red-300 max-w-md">
          You must be signed in to manage your profile.
        </div>
      </div>
    );
  }

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await updateProfile({ full_name: fullName });
      toast({ title: "Profile updated", description: "Your display name has been saved." });
    } catch (err) {
      toast({ title: "Could not update profile", description: err?.message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if ((newPassword || "").length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Re-enter the new password in both fields.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await updateProfile({ current_password: currentPassword, new_password: newPassword });
      toast({ title: "Password updated", description: "Use your new password next time you sign in." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast({ title: "Could not change password", description: err?.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

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
            <UserCircle size={12} /> Account
          </p>
          <h1 className="font-serif-display text-4xl md:text-5xl mt-2">Profile settings.</h1>
          <p className="mt-3 text-sm text-[#F2F0ED]/50 max-w-md">
            Manage your own account — identity, password and session. Administrators manage
            customers in the Admin console.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 lg:px-12 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Identity ---------------------------------------------------------- */}
          <section className="border border-white/10 rounded-sm p-6">
            <h2 className="font-serif-display text-2xl">Identity</h2>
            <dl className="mt-6 space-y-5 text-sm">
              <div>
                <dt className={labelClass}>Email (login identity)</dt>
                <dd className="break-words">{user.email}</dd>
                {(details?.email_verified ?? true) && (
                  <dd className="mt-1 inline-flex items-center gap-1.5 text-[10px] tracking-luxe uppercase text-green-400/80">
                    <BadgeCheck size={12} /> Verified
                  </dd>
                )}
              </div>
              <div>
                <dt className={labelClass}>Account type</dt>
                <dd className="inline-flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <ShieldCheck size={13} className="text-[#C58A58]" />
                      <span className="text-[#C58A58]">Administrator</span>
                    </>
                  ) : (
                    <span className="text-[#F2F0ED]/60">Member</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Member since</dt>
                <dd className="text-[#F2F0ED]/60">{formatDate(details?.created_date)}</dd>
              </div>
            </dl>
          </section>

          {/* Display name ------------------------------------------------------ */}
          <section className="border border-white/10 rounded-sm p-6">
            <h2 className="font-serif-display text-2xl">Display name</h2>
            <p className="text-xs text-[#F2F0ED]/40 mt-2">
              Shown on your account; your invitations carry their own couple/event names.
            </p>
            <form onSubmit={saveName} className="mt-6 space-y-4">
              <div>
                <label htmlFor="fullName" className={labelClass}>
                  Full name
                </label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  maxLength={255}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={savingName}
                className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-6 py-3 hover:bg-[#d89a68] disabled:opacity-50 transition-colors"
              >
                <Save size={14} /> {savingName ? "Saving…" : "Save name"}
              </button>
            </form>
          </section>
          {/* Password ------------------------------------------------------------ */}
          <section className="border border-white/10 rounded-sm p-6">
            <h2 className="font-serif-display text-2xl">Password</h2>
            <p className="text-xs text-[#F2F0ED]/40 mt-2">
              Changing your password signs out other sessions on next login.
            </p>
            <form onSubmit={changePassword} className="mt-6 space-y-4">
              <div>
                <label htmlFor="currentPassword" className={labelClass}>
                  Current password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="newPassword" className={labelClass}>
                  New password (min 8 characters)
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={labelClass}>
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword}
                className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-6 py-3 hover:bg-[#d89a68] disabled:opacity-50 transition-colors"
              >
                <KeyRound size={14} /> {savingPassword ? "Updating…" : "Change password"}
              </button>
            </form>
          </section>

          {/* Session ------------------------------------------------------------- */}
          <section className="border border-white/10 rounded-sm p-6 flex flex-col">
            <h2 className="font-serif-display text-2xl">Session</h2>
            <p className="text-xs text-[#F2F0ED]/40 mt-2">
              Signed in as <span className="text-[#F2F0ED]/70 break-words">{user.email}</span>
              {isAdmin ? " with administrator access." : "."}
            </p>
            <div className="mt-auto pt-8">
              <button
                onClick={() => logout(true)}
                className="inline-flex items-center gap-2 text-xs tracking-luxe-sm uppercase border border-red-400/40 text-red-400/90 px-6 py-3 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          </section>
        </div>

        <p className="mt-8 text-xs text-[#F2F0ED]/40">
          Looking back at your work?{" "}
          <Link to="/studio" className="text-[#C58A58] hover:underline">
            Return to the Studio
          </Link>
          .
        </p>
      </main>
    </div>
  );
}


