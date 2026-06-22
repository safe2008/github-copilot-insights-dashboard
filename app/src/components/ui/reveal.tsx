"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /**
   * When true, the wrapper's direct children animate in sequence with a small
   * stagger instead of the wrapper animating as a single block. Useful for card
   * grids and lists.
   */
  stagger?: boolean;
  /** Distance (px) the target travels along the Y axis as it fades in. */
  y?: number;
  /** Delay (seconds) before the animation starts. */
  delay?: number;
  /** Animation duration (seconds). */
  duration?: number;
}

/**
 * Fade-and-rise entrance animation powered by GSAP.
 *
 * Wrap any block to have it (or its direct children, with `stagger`) ease into
 * view on mount. Honors `prefers-reduced-motion`: motion-sensitive users get
 * the final, settled state with no movement.
 */
export function Reveal({
  children,
  className,
  stagger = false,
  y = 16,
  delay = 0,
  duration = 0.6,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const targets = stagger ? Array.from(root.children) : root;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(targets, { opacity: 1, y: 0 });
        return;
      }

      gsap.from(targets, {
        opacity: 0,
        y,
        duration,
        delay,
        ease: "power2.out",
        stagger: stagger ? 0.06 : 0,
      });
    },
    { scope: ref, dependencies: [stagger, y, delay, duration] }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
