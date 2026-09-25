import type { Game } from '../game';
import type { Tool, ToolPointer } from './tool';

/** Click a road to demolish it (with a partial refund). Hovering shows what would go. */
export class BulldozeTool implements Tool {
  readonly id = 'bulldoze';
  readonly usesLeftDrag = true;
  private hover: number | null = null;
  private hoverInfo: string | null = null;
  private seq = 0;

  constructor(private game: Game) {}

  activate(): void {}

  deactivate(): void {
    this.hover = null;
    this.game.renderer.ghost.highlightSegment(null, 0);
    this.game.setHint(null);
  }

  cancel(): boolean {
    return false;
  }

  private pick(p: ToolPointer): number | null {
    if (!p.ground) return null;
    const net = this.game.world.net;
    const hit = net.nearestSegment(p.ground, 14);
    if (!hit || hit.d > net.halfWidth(hit.seg) + 1) return null;
    return hit.seg;
  }

  pointerMove(p: ToolPointer): void {
    const id = this.pick(p);
    const net = this.game.world.net;
    if (id !== this.hover) {
      this.hover = id;
      this.hoverInfo = null;
      this.game.renderer.ghost.highlightSegment(
        id !== null ? net.curve(id) : null,
        id !== null ? net.halfWidth(id) : 0,
      );
      if (id !== null) {
        const seq = ++this.seq;
        void this.game.client.preview({ type: 'bulldoze', target: { kind: 'segment', id } }).then((r) => {
          if (seq !== this.seq) return;
          this.hoverInfo = r.ok ? `Bulldoze road · refund $${(-r.cost).toLocaleString('en-US')}` : r.reason;
          this.game.setHint({
            x: p.clientX,
            y: p.clientY,
            text: this.hoverInfo,
            tone: r.ok ? 'bad' : 'info',
          });
        });
      }
    }
    this.game.setHint(
      id === null
        ? { x: p.clientX, y: p.clientY, text: 'Bulldozer — click a road', tone: 'info' }
        : { x: p.clientX, y: p.clientY, text: this.hoverInfo ?? 'Bulldoze road', tone: 'bad' },
    );
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0) return;
    const id = this.pick(p);
    if (id === null) return;
    void this.game.dispatch({ type: 'bulldoze', target: { kind: 'segment', id } }).then((r) => {
      if (r.ok) this.game.audio?.play('bulldoze');
      this.hover = null;
      this.game.renderer.ghost.highlightSegment(null, 0);
    });
  }

  pointerUp(): void {}
}
