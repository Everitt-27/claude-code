// Animate a transferred item arcing and shrinking into the floating kit bubble,
// like crumpled paper tossed into a bin. Respects the OS Reduce Motion setting.

import { prefersReducedMotion } from "../store/useUI";

export function tossToBubble(fromRect: DOMRect, label: string) {
  const bubble = document.querySelector(".bubble") as HTMLElement | null;
  if (!bubble) return;
  const to = bubble.getBoundingClientRect();
  const target = { x: to.left + to.width / 2, y: to.top + to.height / 2 };

  if (prefersReducedMotion()) {
    // Reduce Motion: a brief, non-animated pulse instead of the arc.
    bubble.animate?.(
      [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
      { duration: 1, iterations: 1 },
    );
    return;
  }

  const el = document.createElement("div");
  el.className = "toss";
  el.textContent = label;
  el.style.left = `${fromRect.left}px`;
  el.style.top = `${fromRect.top}px`;
  document.body.appendChild(el);

  const dx = target.x - (fromRect.left + fromRect.width / 2);
  const dy = target.y - (fromRect.top + fromRect.height / 2);
  const midX = dx * 0.5;
  const arc = Math.min(-120, dy - 160); // arc upward before dropping in

  const anim = el.animate(
    [
      { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
      { transform: `translate(${midX}px, ${arc}px) rotate(180deg) scale(0.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(0.1)`, opacity: 0.2 },
    ],
    { duration: 650, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
  anim.onfinish = () => {
    el.remove();
    bubble.animate?.(
      [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }],
      { duration: 260, easing: "ease-out" },
    );
  };
}
