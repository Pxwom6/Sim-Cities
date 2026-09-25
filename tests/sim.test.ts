import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MAP_SIZE, HEIGHT_RES, GRID_RES } from '../src/data/world';

describe('Sim basics', () => {
  it('creates deterministically: same seed ⇒ same hash, different seed ⇒ different hash', () => {
    const a = Sim.create({ seed: 'one' });
    const b = Sim.create({ seed: 'one' });
    const c = Sim.create({ seed: 'two' });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('advances ticks and applies commands', () => {
    const sim = Sim.create({ seed: 's' });
    sim.testMode = true;
    const start = sim.state.treasury;
    expect(sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 1000 })).toMatchObject({ ok: true });
    sim.advance(100);
    expect(sim.tick).toBe(100);
    expect(sim.state.treasury).toBe(start + 1000);
    expect(sim.dispatch({ type: 'renameCity', name: '   ' })).toMatchObject({ ok: false });
  });

  it('preview never mutates', () => {
    const sim = Sim.create({ seed: 's' });
    const h = sim.hash();
    sim.preview({ type: 'cheat', cheat: 'addMoney', amount: 5 });
    sim.preview({ type: 'renameCity', name: 'Elsewhere' });
    expect(sim.hash()).toBe(h);
  });

  it('save → load round-trips exactly (same hash) and keeps running identically', () => {
    const sim = Sim.create({ seed: 'roundtrip', preset: 'coast' });
    sim.dispatch({ type: 'renameCity', name: 'Harbourside' });
    sim.advance(500);
    const save = JSON.parse(JSON.stringify(sim.save('now')));
    const loaded = Sim.fromSave(save);
    expect(loaded.hash()).toBe(sim.hash());
    sim.advance(300);
    loaded.advance(300);
    expect(loaded.hash()).toBe(sim.hash());
  });

  it('replaying the command log reproduces the state hash', () => {
    const opts = { seed: 'replay' };
    const sim = Sim.create(opts);
    sim.advance(10);
    sim.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 250 });
    sim.advance(40);
    sim.dispatch({ type: 'renameCity', name: 'Replayville' });
    sim.advance(25);
    const replayed = Sim.replay(opts, sim.log, sim.tick);
    expect(replayed.tick).toBe(sim.tick);
    expect(replayed.hash()).toBe(sim.hash());
  });

  it('snapshot carries terrain of the right size', () => {
    const snap = Sim.create({ seed: 'snap' }).snapshot();
    expect(snap.heights.length).toBe(HEIGHT_RES * HEIGHT_RES);
    expect(snap.trees.length).toBe(GRID_RES * GRID_RES);
    expect(snap.terrainParams.highway.connectZ).toBeGreaterThan(0);
    expect(snap.terrainParams.highway.connectZ).toBeLessThan(MAP_SIZE);
  });
});
