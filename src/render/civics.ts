import { Group, Mesh, type Material } from 'three';
import type { ClientWorld } from '../client/world';
import type { CivicData } from '../sim/protocol';
import { assets } from './assets/registry';
import { Arrays, appendModel, buildingYaw } from './buildings';

/** Civic buildings (utilities, services, parks): one merged mesh each; there are few of them. */
export class CivicRenderer {
  readonly group = new Group();
  private meshes = new Map<number, Mesh>();
  readonly heights = new Map<number, number>();

  constructor(
    private world: ClientWorld,
    private material: Material,
  ) {
    for (const c of world.civics.values()) this.place(c.id);
    world.onCivics((changed, removed) => {
      for (const id of removed) this.place(id);
      for (const id of changed) this.place(id);
    });
  }

  private place(id: number): void {
    const old = this.meshes.get(id);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes.delete(id);
    }
    const c = this.world.civics.get(id);
    if (!c) {
      this.heights.delete(id);
      return;
    }
    const m = assets.civic(c.def, c.variant, c.fill);
    const arr = new Arrays(false);
    appendModel(arr, m, c.x, c.y, c.z, buildingYaw(c));
    const mesh = new Mesh(arr.geometry(), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `civic-${c.def}-${id}`;
    this.meshes.set(id, mesh);
    this.heights.set(id, m.height);
    this.group.add(mesh);
  }

  data(id: number): CivicData | undefined {
    return this.world.civics.get(id);
  }
}
