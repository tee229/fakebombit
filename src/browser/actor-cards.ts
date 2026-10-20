import type Phaser from 'phaser';
import type { WorldState } from '../match/index.js';
import type { ReadyTheme } from '../resources/index.js';
import { appearance, hex } from './appearance.js';
import { actorIdentity } from './actor-identity.js';
import { arenaLayout } from './layout.js';
import type { FeedbackEffect } from '../presentation/feedback.js';

/** Read-only match chrome: identities and abilities stay outside the map. */
export class ActorCards {
  private readonly root = document.createElement('div');
  private readonly cards = new Map<string, HTMLElement>();
  private readonly timer: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly history: HTMLElement;
  private revision = -1;
  private readonly diagnostic: string;
  constructor(private readonly scene: Phaser.Scene, _parent: Phaser.GameObjects.Container, world: WorldState, theme: ReadyTheme<HTMLImageElement>, private readonly arena = 'generated') {
    this.root.className = 'match-hud';
    this.diagnostic = theme.diagnostics.length ? '装饰缺失，已省略 · ' : '';
    this.root.innerHTML = `<header class="match-heading"><strong>Fake Bomb It</strong><span class="match-progress"></span></header><div class="match-timer" aria-label="剩余时间"></div><p class="match-history"></p>`;
    this.timer = this.root.querySelector('.match-timer')!; this.progress = this.root.querySelector('.match-progress')!; this.history = this.root.querySelector('.match-history')!;
    for (const actor of world.actors) {
      const card = document.createElement('section'); card.className = 'actor-card'; card.setAttribute('aria-label', actorIdentity(world, actor).name);
      card.innerHTML = `<img src="./skins/${theme.package.skin?.id ?? 'mint'}-preview.svg" alt="" draggable="false"><div class="actor-card-body"><div class="actor-card-heading"><strong></strong><span class="actor-state"></span></div><div class="actor-abilities"><span title="已放炸弹 / 容量"></span><span title="爆炸距离"></span><span title="移动速度"></span></div></div>`;
      this.cards.set(actor.id, card); this.root.append(card);
    }
    document.getElementById('game')!.append(this.root);
  }
  present(world: WorldState, effects: readonly FeedbackEffect[] = [], latestChange = ''): void {
    const layout = arenaLayout.actorCards, s = arenaLayout.cssScale;
    if (this.revision !== arenaLayout.revision) {
      this.revision = arenaLayout.revision;
      this.root.classList.toggle('compact', arenaLayout.compact);
      world.actors.forEach((actor,index) => {
        const card = this.cards.get(actor.id)!;
        Object.assign(card.style, { left: `${(index < 2 ? layout.left : layout.right) * s}px`, top: `${((index < 2 ? layout.top : layout.rightTop) + index % 2 * (layout.height + layout.gap)) * s}px`, width: `${layout.width * s}px`, height: `${layout.height * s}px` });
      });
      Object.assign(this.history.style, { left: `${arenaLayout.board.x * s}px`, width: `${arenaLayout.board.width * s}px` });
      this.timer.style.left = arenaLayout.compact ? `${(layout.left + layout.width) * s - 44}px` : '50%';
    }
    const palette = appearance();
    const summary = world.actors.map(actor => {
      const card = this.cards.get(actor.id)!, identity = actorIdentity(world,actor);
      card.style.setProperty('--actor-color', hex(palette.mode === 'light' ? identity.lightColor : identity.color));
      card.classList.toggle('eliminated', !actor.alive); card.classList.toggle('player', identity.player);
      card.querySelector('strong')!.textContent = identity.name;
      const gain = effects.findLast(effect => effect.kind === 'pickup' && effect.actorId === actor.id)?.label;
      card.querySelector('.actor-state')!.textContent = actor.alive ? gain ?? '' : '已淘汰';
      const bombs = world.bombs.filter(bomb => bomb.ownerId === actor.id).length;
      const values = [`弹${bombs}/${actor.abilities.bombCapacity}`, `距${actor.abilities.blastRange}`, `速${Number(actor.abilities.speed.toFixed(2))}`];
      card.querySelectorAll('.actor-abilities span').forEach((text,index) => { text.textContent = values[index]!; });
      return { id: actor.id, name: identity.name, alive: actor.alive, gain: gain ?? '', bombs, ...actor.abilities,
        bounds: { x: parseFloat(card.style.left) / s, y: parseFloat(card.style.top) / s, width: layout.width, height: layout.height } };
    });
    const remaining = Math.max(0, Math.ceil(world.initialization.rules.matchDurationSeconds - world.tick / world.initialization.rules.tickRate));
    this.timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}`;
    this.progress.textContent = this.arena === 'escape' ? `逃生练习 · AI ${world.actors.find(actor => actor.ai)?.ai?.status ?? ''}`
      : `对手 ${world.actors.filter(actor => actor.id !== world.initialization.playerId && actor.alive).length} / ${world.actors.length - 1}`;
    this.history.textContent = this.diagnostic + (latestChange || `种子 ${world.initialization.seed} · ${world.initialMap.width} × ${world.initialMap.height}`);
    this.scene.game.canvas.dataset.actorCards = JSON.stringify(summary);
  }
  destroy(): void { this.root.remove(); this.cards.clear(); }
}
