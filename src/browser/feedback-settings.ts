const motion = matchMedia('(prefers-reduced-motion: reduce)');
let volume = .45, particleBudget = 96;
try {
  const saved: unknown = JSON.parse(localStorage.getItem('fakebombit-feedback-v1') ?? 'null');
  if (saved && typeof saved === 'object') {
    if ('volume' in saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.min(1, Math.max(0, saved.volume));
    if ('particleBudget' in saved && [0, 32, 96].includes(Number(saved.particleBudget))) particleBudget = Number(saved.particleBudget);
  }
} catch { /* Use defaults when legacy or unavailable storage cannot be read. */ }
function save(): void { try { localStorage.setItem('fakebombit-feedback-v1', JSON.stringify({ volume, particleBudget })); } catch { /* Visit-only preference. */ } }
export function setVolume(value: number): void { if (Number.isFinite(value)) { volume = Math.max(0, Math.min(1, value)); save(); } }
export function setParticleBudget(value: number): void { if ([0, 32, 96].includes(value)) { particleBudget = value; save(); } }
export const readFeedbackSettings = () => ({ volume, particleBudget, reducedMotion: motion.matches });
export function cycleVolume(): void { const values = [0, .25, .45, .75]; volume = values[(values.indexOf(volume) + 1) % values.length]!; save(); }
export function cycleParticles(): void { const values = [96, 32, 0]; particleBudget = values[(values.indexOf(particleBudget) + 1) % values.length]!; save(); }
export function feedbackLabels() {
  return { volume: volume === 0 ? '声音 关闭' : `音量 ${Math.round(volume * 100)}%`,
    particles: `粒子 ${motion.matches || particleBudget === 0 ? '关闭' : particleBudget === 32 ? '精简' : '丰富'}` };
}
