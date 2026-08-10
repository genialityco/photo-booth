import confetti from "canvas-confetti";
import type { ButtonClickEffectHandler } from "./types";

const confettiEffect: ButtonClickEffectHandler = ({ target }) => {
  const rect = target.getBoundingClientRect();
  const origin = {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  };

  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 35,
    ticks: 120,
    origin,
    zIndex: 9999,
  });
};

export default confettiEffect;
