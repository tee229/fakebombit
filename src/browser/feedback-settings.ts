const motion = matchMedia('(prefers-reduced-motion: reduce)');
let volume = .45, particleBudget = 96;
export const readFeedbackSettings = () => ({ volume, particleBudget, reducedMotion: motion.matches });
export function cycleVolume(): void { const values = [0, .25, .45, .75]; volume = values[(values.indexOf(volume) + 1) % values.length]!; }
export function cycleParticles(): void { const values = [96, 32, 0]; particleBudget = values[(values.indexOf(particleBudget) + 1) % values.length]!; }
export function feedbackLabels() {
  return { volume: volume === 0 ? '声音 关闭' : `音量 ${Math.round(volume * 100)}%`,
    particles: `粒子 ${motion.matches || particleBudget === 0 ? '关闭' : particleBudget === 32 ? '精简' : '丰富'}` };
}
