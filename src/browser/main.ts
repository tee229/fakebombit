import Phaser from 'phaser';
import { createMatch } from '../match/index.js';
import { EntitiesView } from './entities-view.js';
import { trainingMatchConfig } from './training-map.js';
import './style.css';

// The browser composition root. Input and fixed-step flow are connected in the next slice.
class TrainingScene extends Phaser.Scene {
  constructor() { super('training'); }

  create(): void {
    const match = createMatch(trainingMatchConfig);
    const view = new EntitiesView(this, match.readWorld());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.destroy());
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('aria-label', '实体训练场：玩家、固定墙、可破坏障碍及三个静止目标');
    this.game.canvas.setAttribute('aria-describedby', 'instructions');
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#102b2c',
  width: 1024, height: 720,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, smoothStep: false },
  scene: TrainingScene,
  audio: { noAudio: true },
});

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
