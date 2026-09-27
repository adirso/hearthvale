// Imperative "cards leaving your hand" animation. Cards are cloned from the
// hand panel and flown to the receiving player's row (or up and away to the
// bank) with the Web Animations API, so React state is never involved.

import { RESOURCES } from '../engine';
import type { Loss } from './lossEvents';

const FLIGHT_MS = 900;

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function animateLoss(loss: Loss) {
  if (typeof document === 'undefined') return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const target =
    loss.to === 'bank' ? null : document.querySelector(`[data-player-row="${loss.to}"]`);
  let index = 0;
  for (const r of RESOURCES) {
    const count = loss.cards[r];
    if (!count) continue;
    const slot = document.querySelector<HTMLElement>(`[data-hand-resource="${r}"]`);
    if (!slot) continue;
    markSlot(slot, count);
    if (reduced) continue;
    const glyph = slot.querySelector('svg');
    const from = center(glyph ?? slot);
    const to = target ? center(target) : { x: from.x, y: from.y - 140 };
    for (let i = 0; i < count; i++) {
      const flyer = document.createElement('div');
      flyer.className = 'loss-flyer';
      if (glyph) flyer.appendChild(glyph.cloneNode(true));
      flyer.style.left = `${from.x}px`;
      flyer.style.top = `${from.y}px`;
      document.body.appendChild(flyer);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const anim = flyer.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% + ${dy * 0.15 - 40}px)) scale(1.45) rotate(-8deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55) rotate(18deg)`, opacity: 0.1 },
        ],
        { duration: FLIGHT_MS, delay: index * 140, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'both' },
      );
      anim.onfinish = () => flyer.remove();
      index++;
    }
  }
  if (target && !reduced) {
    setTimeout(() => {
      target.classList.remove('receiving');
      void (target as HTMLElement).offsetWidth;
      target.classList.add('receiving');
      setTimeout(() => target.classList.remove('receiving'), 700);
    }, FLIGHT_MS * 0.8 + (index - 1) * 140);
  }
}

/** Flash the hand slot red with a "−n" badge. */
function markSlot(slot: HTMLElement, count: number) {
  slot.classList.remove('losing');
  void slot.offsetWidth; // restart the CSS animation
  slot.classList.add('losing');
  const badge = document.createElement('span');
  badge.className = 'loss-badge';
  badge.textContent = `−${count}`;
  slot.appendChild(badge);
  setTimeout(() => {
    badge.remove();
    slot.classList.remove('losing');
  }, 1800);
}
