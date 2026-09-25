import { Sim } from '../../src/sim/sim';
const sim = Sim.create({ seed: 'citybloom', preset: 'river' });
const c = sim.state.net.nodes.get(sim.state.highway.connect)!;
console.log('connect', c.x, c.z);
for (let z = 300; z <= 1000; z += 40) {
  let row = `${String(z).padStart(4)} `;
  for (let x = 20; x <= 1000; x += 30) {
    const h = sim.terrain.heightAt(x, z);
    row += h < 0.6 ? ' ~' : String(Math.min(99, Math.round(h))).padStart(2);
    row += ' ';
  }
  console.log(row);
}
