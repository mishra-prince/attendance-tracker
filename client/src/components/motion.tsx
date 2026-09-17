// Shared motion primitives — the app-wide animation language.
// Spring-based, interruptible, respects reduced motion via useReducedMotion.
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

export const spring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 } as const;
export const springSoft = { type: 'spring', stiffness: 260, damping: 26 } as const;

/** Staggered list container — children fade/slide in sequence */
export function Stagger({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? undefined : 'hidden'}
      animate={reduce ? undefined : 'show'}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

/** Item inside a Stagger — rises 14px + fades */
export function StaggerItem({ children, className, ...rest }: HTMLMotionProps<'div'> & { children?: ReactNode }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: spring } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Tap-pressable card/button — scales down on press, lifts on hover */
export function Pressable({ children, className, ...rest }: HTMLMotionProps<'div'> & { children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={spring}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Page transition wrapper */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? undefined : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
