import type { Game } from '../game';
import type { Tool, ToolPointer } from './tool';

/** Default tool: left-drag pans the camera; clicks select things (inspector from M2). */
export class SelectTool implements Tool {
  readonly id = 'select';
  readonly usesLeftDrag = false;
  constructor(private game: Game) {}
  activate(): void {}
  deactivate(): void {}
  cancel(): boolean {
    return false;
  }
  pointerDown(_p: ToolPointer): void {}
  pointerMove(_p: ToolPointer): void {
    this.game.setHint(null);
  }
  pointerUp(_p: ToolPointer): void {}
}
