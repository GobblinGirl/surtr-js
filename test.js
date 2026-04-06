'use strict';

// Minimal Node.js test — runs the sim headlessly and prints results.
// Usage: node test.js

const { runSim, TICKS_PER_S } = require('./engine');
const surtr       = require('./operators/surtr');
const lumen       = require('./operators/lumen');
const haruka      = require('./operators/haruka');
const skadiAlt    = require('./operators/skadi_alt');
const dummyEnemy  = require('./operators/dummy_enemy');

const config = {
  surtrM3:          false,
  surtrBlocking:    false,
  lumenPrecharged:  false,
  harukaPrecharged: false,
  enemyDef:         0,
  enemyRes:         0,
};

console.log('Running simulation...\n');

const state = runSim([surtr, lumen, haruka, skadiAlt, dummyEnemy], config);

// ── Results ────────────────────────────────────────────────
const s      = state.ops['surtr'];
const l      = state.ops['lumen'];
const h      = state.ops['haruka'];
const sk     = state.ops['skadi_alt'];
const enemy  = state.ops['dummy_enemy'];

console.log(`Lifetime:      ${state.lifetime >= 300 ? '>5 min' : state.lifetime.toFixed(1) + 's'}`);
console.log(`Surtr final HP: ${s.hp.toFixed(1)} / ${s.maxHP}`);
const totalHealing = (l.totalHealing || 0) + (h.totalHealing || 0) + (sk.totalHealing || 0);
console.log(`Total healing received by Surtr: ${totalHealing.toFixed(0)} HP`);
console.log(`  Lumen:  ${(l.totalHealing || 0).toFixed(0)} HP`);
console.log(`  Haruka: ${(h.totalHealing || 0).toFixed(0)} HP`);
console.log(`  Skadi:  ${(sk.totalHealing || 0).toFixed(0)} HP`);
console.log(`Total damage dealt by Surtr: ${s.totalDamage.toFixed(0)}`);
console.log(`  (enemy DEF: ${config.enemyDef}, RES: ${config.enemyRes}, -24 from talent)`);

console.log('\nKey events:');
for (const ev of state.log) {
  console.log(`  t=${ev.t.toFixed(2)}s  ${ev.type}`, ev.data ?? '');
}
