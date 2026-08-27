import { motion } from "framer-motion";

export default function NotFoundState({ slug }) {
  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#F2F0ED] flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="text-[11px] tracking-luxe uppercase text-[#C58A58]"
        >
          404
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif-display font-light text-5xl md:text-7xl mt-6 leading-tight"
        >
          Invitation <span className="italic text-[#C58A58]">not found.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-6 text-[#F2F0ED]/50 text-sm leading-relaxed"
        >
          {slug ? `No invitation exists for "${slug}".` : "This invitation could not be located."}
          <br />
          Please check the link you received and try again.
        </motion.p>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="mx-auto mt-10 h-px w-16 bg-[#C58A58] origin-center"
        />
      </div>
    </main>
  );
}