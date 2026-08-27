import { motion } from "framer-motion";

export default function Preloader({ couple }) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] inv-bg flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* top and bottom curtain panels that split apart */}
      <motion.div
        className="absolute inset-x-0 top-0 h-1/2 inv-bg"
        initial={{ y: 0 }}
        animate={{ y: "-101%" }}
        transition={{ delay: 1.7, duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-1/2 inv-bg"
        initial={{ y: 0 }}
        animate={{ y: "101%" }}
        transition={{ delay: 1.7, duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      />

      <div className="relative flex flex-col items-center gap-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-[10px] tracking-luxe uppercase inv-accent"
        >
          momenti.co
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="font-serif-display italic text-3xl inv-text"
        >
          {couple}
        </motion.p>
        {/* the copper line that grows horizontally */}
        <div className="w-48 h-px inv-accent-bg-20 overflow-hidden">
          <motion.div
            className="h-full inv-accent-bg"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.8, duration: 1.1, ease: "easeInOut" }}
            style={{ originX: 0 }}
          />
        </div>
      </div>
    </motion.div>
  );
}