import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
      <div className="flex rounded-full items-center space-x-2">
          {[0, 1, 2].map((i) => (
              <motion.span
                  key={i}
                  className="text-sm"
                  animate={{
                      y: [0, -8, 0],
                      rotate: [0, 15, -15, 0],
                  }}
                  transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: 'easeInOut',
                  }}
              >
                  ⚽️
              </motion.span>
          ))}
      </div>
  );
}
