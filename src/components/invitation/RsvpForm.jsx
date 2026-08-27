import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function RsvpForm({ data }) {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    attendance: "accepts",
    guests: "1",
  });

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="rsvp" className="inv-bg text-[#F2F0ED] py-28 md:py-40 px-6">
      <div className="mx-auto max-w-xl text-center">
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.div
              key="form"
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5 }}
            >
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="text-[11px] tracking-luxe uppercase inv-accent"
              >
                The Guest Ledger
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="font-serif-display font-light text-4xl md:text-6xl mt-4"
              >
                Will you <span className="italic inv-accent">join us?</span>
              </motion.h2>

              <form onSubmit={handleSubmit} className="mt-14 space-y-10 text-left">
                <Field label="Full Name">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-[#F2F0ED]/20 focus:border-[var(--inv-accent)] focus:ring-0 outline-none py-3 text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
                    placeholder="Your name"
                  />
                </Field>

                <Field label="Email">
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-[#F2F0ED]/20 focus:border-[var(--inv-accent)] focus:ring-0 outline-none py-3 text-[#F2F0ED] placeholder-[#F2F0ED]/30 transition-colors"
                    placeholder="you@email.com"
                  />
                </Field>

                <Field label="Attendance">
                  <div className="flex flex-col sm:flex-row gap-4 mt-2">
                    {[
                      { v: "accepts", l: "Joyfully Accepts" },
                      { v: "declines", l: "Regretfully Declines" },
                    ].map((o) => (
                      <label
                        key={o.v}
                        className={`flex-1 cursor-pointer border px-5 py-4 text-sm tracking-wide transition-colors ${
                          form.attendance === o.v
                            ? "inv-accent-border inv-accent"
                            : "border-[#F2F0ED]/20 text-[#F2F0ED]/60 hover:border-[#F2F0ED]/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="attendance"
                          value={o.v}
                          checked={form.attendance === o.v}
                          onChange={(e) => update("attendance", e.target.value)}
                          className="hidden"
                        />
                        {o.l}
                      </label>
                    ))}
                  </div>
                </Field>

                <Field label="Number of Guests">
                  <select
                    value={form.guests}
                    onChange={(e) => update("guests", e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-[#F2F0ED]/20 focus:border-[var(--inv-accent)] outline-none py-3 text-[#F2F0ED] transition-colors"
                  >
                    {["1", "2", "3", "4", "5"].map((n) => (
                      <option key={n} value={n} className="inv-bg">
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full mt-4 inv-accent-bg inv-ink py-4 text-xs tracking-luxe-sm uppercase inv-accent-hover transition-colors"
                >
                  Send Response
                </motion.button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="py-20"
            >
              {/* generative monogram pattern */}
              <div className="relative mx-auto w-48 h-48 mb-10">
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0, rotate: -30 }}
                    animate={{ opacity: 0.5 - i * 0.06, scale: 1 - i * 0.13, rotate: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.6, ease: "easeOut" }}
                    className="absolute inset-0 border inv-accent-border rounded-full"
                  />
                ))}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  className="absolute inset-0 flex items-center justify-center font-serif-display italic text-4xl inv-accent"
                >
                  {data.coupleShort}
                </motion.p>
              </div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="font-serif-display text-3xl md:text-4xl"
              >
                Thank you for your response.
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="mt-4 text-sm text-[#F2F0ED]/50"
              >
                {form.attendance === "accepts"
                  ? "We can't wait to celebrate with you."
                  : "We'll miss you, and raise a glass in your honour."}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}