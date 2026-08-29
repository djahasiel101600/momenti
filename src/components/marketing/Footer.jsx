import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";

const socials = ["Instagram", "Pinterest", "Behance", "LinkedIn"];

export default function Footer() {
  const { appPublicSettings } = useAuth();
  const termsUrl = appPublicSettings?.terms_url;
  const privacyUrl = appPublicSettings?.privacy_url;
  const hasLegal = Boolean(termsUrl || privacyUrl);

  return (
    <footer id="contact" className="bg-[#0A0A0A] text-[#F2F0ED] pt-28 pb-12 px-6 lg:px-16 border-t border-white/5">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-20 border-b border-white/10">
          <div className="md:col-span-6">
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif-display font-light text-5xl md:text-7xl leading-[1.05]"
            >
              Let's craft your <span className="italic text-[#C58A58]">moment.</span>
            </motion.h2>
            <motion.a
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.3 }}
              href="mailto:hello@momenti.co"
              className="inline-flex items-center gap-3 mt-10 text-xs tracking-luxe-sm uppercase bg-[#C58A58] text-[#0A0A0A] px-8 py-4 hover:bg-[#d89a68] transition-colors"
            >
              Get Started →
            </motion.a>
          </div>
          <div className="md:col-span-3 md:col-start-8">
            <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-5">Studio</p>
            <p className="text-sm text-[#F2F0ED]/70 leading-relaxed">
              hello@momenti.co
              <br />
              New York · London · Manila
            </p>
          </div>
          <div className="md:col-span-3">
            <p className="text-[10px] tracking-luxe uppercase text-[#F2F0ED]/40 mb-5">Follow</p>
            <ul className="space-y-3">
              {socials.map((s) => (
                <li key={s}>
                  <a
                    href="#"
                    className="text-sm text-[#F2F0ED]/70 hover:text-[#C58A58] transition-colors"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[#F2F0ED]/30">
          <p className="font-serif-display text-xl lowercase">
            momenti<span className="text-[#C58A58]">.</span>co
          </p>
          <p className="text-xs tracking-wide">
            © {new Date().getFullYear()} momenti.co — Digital Invitations that Move You.
          </p>
          {hasLegal && (
            <div className="flex gap-6 text-xs">
              {privacyUrl ? (
                <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#F2F0ED] transition-colors">Privacy</a>
              ) : (
                <span className="opacity-30">Privacy</span>
              )}
              {termsUrl ? (
                <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#F2F0ED] transition-colors">Terms</a>
              ) : (
                <span className="opacity-30">Terms</span>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}