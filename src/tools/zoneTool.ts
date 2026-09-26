import type { ZoneLetter } from '../data/zones';
import type { Vec2 } from '../sim/geom';
import type { Game } from '../game';
import type { Tool, ToolPointer } from './tool';

const BRUSH_COLOURS: Record<ZoneLetter | 'none', string> = {
  R: '#58c27d',
  C: '#4d9bf5',
  I: '#f3b93a',
  none: '#ffffff',
};
let strokeCounter = 1;

/**
 * Zone painting with a round brush along the drag path; shift-click fills both sides of a road.
 * Only empty, valid cells change. Each drag is one undo step.
 */
export class ZoneTool implements Tool {
  readonly id = 'zone';
  readonly usesLeftDrag = true;
  zone: ZoneLetter | 'none' = 'R';
  radius = 24;
  private painting = false;
  private last: Vec2 | null = null;
  private stroke = 0;

  constructor(private game: Game) {}

  activate(): void {
    this.game.renderer.zones.setGridVisible(true);
  }

  deactivate(): void {
    this.painting = false;
    this.game.renderer.zones.setGridVisible(false);
    this.game.renderer.ghost.showBrush(null, 1);
    this.game.setHint(null);
  }

  cancel(): boolean {
    const was = this.painting;
    this.painting = false;
    return was;
  }

  private paint(points: Vec2[]): void {
    void this.game.dispatch({
      type: 'zone',
      zone: this.zone,
      area: { kind: 'brush', points, radius: this.radius },
      stroke: this.stroke,
    });
  }

  pointerDown(p: ToolPointer): void {
    if (p.button !== 0 || !p.ground) return;
    if (p.shift) {
      const hit = this.game.world.net.nearestSegment(p.ground, 20);
      if (hit)
        void this.game.dispatch({ type: 'zone', zone: this.zone, area: { kind: 'segment', id: hit.seg } });
      return;
    }
    this.painting = true;
    this.stroke = strokeCounter++;
    this.last = { x: p.ground.x, z: p.ground.z };
    this.paint([this.last]);
    this.game.audio?.play('zone');
  }

  pointerMove(p: ToolPointer): void {
    const g = this.game.renderer.ghost;
    g.showBrush(p.ground, this.radius, BRUSH_COLOURS[this.zone]);
    const name =
      this.zone === 'none'
        ? 'Dezone'
        : `${{ R: 'Residential', C: 'Commercial', I: 'Industrial' }[this.zone]} zone`;
    this.game.setHint({
      x: p.clientX,
      y: p.clientY,
      text: `${name} · brush ${this.radius} m ([ ]) · shift-click fills a road`,
      tone: 'info',
    });
    if (!this.painting || !p.ground || !this.last) return;
    if (Math.hypot(p.ground.x - this.last.x, p.ground.z - this.last.z) < this.radius / 3) return;
    const next = { x: p.ground.x, z: p.ground.z };
    this.paint([this.last, next]);
    this.last = next;
  }

  pointerUp(): void {
    this.painting = false;
  }

  key(e: KeyboardEvent): boolean {
    if (e.code === 'BracketLeft') this.radius = Math.max(8, this.radius - 8);
    else if (e.code === 'BracketRight') this.radius = Math.min(96, this.radius + 8);
    else return false;
    this.game.notify();
    return true;
  }

  setZone(z: ZoneLetter | 'none'): void {
    this.zone = z;
    this.game.notify();
  }
}
