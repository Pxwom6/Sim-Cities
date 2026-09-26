import { TRANSIT } from '../data/balance';
import type { Game } from '../game';
import type { Tool, ToolPointer } from './tool';

/** Place bus stops: click beside a road. A depot's buses loop through every stop they reach. */
export class StopTool implements Tool {
  readonly id = 'stop';
  readonly usesLeftDrag = true;
  private pointer = { x: 0, y: 0 };
  private seq = 0;

  constructor(private game: Game) {}

  activate(): void {}

  deactivate(): void {
    this.game.renderer.ghost.showMarker(null);
    this.game.renderer.ghost.showSnap(null);
    this.game.setHint(null);
  }

  cancel(): boolean {
    return false;
  }

  pointerMove(p: ToolPointer): void {
    this.pointer = { x: p.clientX, y: p.clientY };
    if (!p.ground) return;
    const seq = ++this.seq;
    const g = p.ground;
    void this.game.client.preview({ type: 'placeStop', x: g.x, z: g.z }).then((r) => {
      if (seq !== this.seq) return;
      const ghost = this.game.renderer.ghost;
      if (r.ok) {
        const at = r.info as { x: number; z: number };
        ghost.showSnap(at);
        ghost.showMarker(null);
        const depots = this.game.world.lines.length;
        this.game.setHint({
          ...this.pointer,
          text: `Bus stop · $${TRANSIT.stopCost}${depots ? '' : ' · buses need a depot'}`,
          tone: 'ok',
        });
      } else {
        ghost.showSnap(null);
        ghost.showMarker(r.at ?? null);
        this.game.setHint({ ...this.pointer, text: r.reason, tone: 'bad' });
      }
    });
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0 || !p.ground) return;
    void this.game.dispatch({ type: 'placeStop', x: p.ground.x, z: p.ground.z }).then((r) => {
      if (r.ok) {
        this.game.audio?.play('build');
        this.game.toast('Bus stop placed', 'ok', 1500);
      } else {
        this.game.audio?.play('error');
        this.game.setHint({ ...this.pointer, text: r.reason, tone: 'bad' });
      }
    });
  }

  pointerUp(): void {}
}
