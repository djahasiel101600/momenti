import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Templates", href: "#templates" },
  { label: "Features", href: "#features" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-500 ${
        scrolled ? "bg-[#0A0A0A]/80 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto max-w-[1400px] px-6 lg:px-12 h-20 flex items-center justify-between text-[#F2F0ED]">
        <a href="#top" className="font-serif-display text-2xl tracking-luxe-sm lowercase">
          momenti<span className="text-[#C58A58]">.</span>co
        </a>

        <div className="hidden md:flex items-center gap-10">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/70 hover:text-[#F2F0ED] transition-colors"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/studio"
            className="text-xs tracking-luxe-sm uppercase text-[#F2F0ED]/70 hover:text-[#F2F0ED] transition-colors"
          >
            Studio
          </Link>
          <a
            href="#contact"
            className="text-xs tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 hover:bg-[#C58A58] hover:text-[#0A0A0A] transition-colors"
          >
            Get Started
          </a>
        </div>

        <button
          className="md:hidden text-[#F2F0ED]"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="md:hidden bg-[#0A0A0A] border-t border-white/10 overflow-hidden"
        >
          <div className="px-6 py-6 flex flex-col gap-5">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm tracking-luxe-sm uppercase text-[#F2F0ED]/80"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/studio"
              onClick={() => setOpen(false)}
              className="text-sm tracking-luxe-sm uppercase text-[#F2F0ED]/80"
            >
              Studio
            </Link>
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="text-sm tracking-luxe-sm uppercase border border-[#C58A58] text-[#C58A58] px-5 py-2.5 text-center"
            >
              Get Started
            </a>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}