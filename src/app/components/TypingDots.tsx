import { motion } from 'motion/react';

interface TypingDotsProps {
  size?: 'sm' | 'md';
  color?: string;
}

export default function TypingDots({ size = 'md', color }: TypingDotsProps) {
  const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5';
  const containerGap = size === 'sm' ? 'gap-[2px]' : 'gap-[4px]';

  return (
    <span className={`inline-flex items-center ${containerGap}`}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className={`${dotSize} rounded-full ${color || 'bg-wa-accent'}`}
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}
