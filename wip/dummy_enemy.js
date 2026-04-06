'use strict';

// ═══════════════════════════════════════════════════════════
//  DUMMY ENEMY — simulation target for Surtr's attacks
//  Not a real Arknights operator; exists to absorb DPS output.
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'dummy_enemy',
  label:       'Enemy',
  short:       'ENM',
  color:       '#555555',
  attackType:  'none',   // Doesn't attack - just a damage sink
  desc:        'Configurable dummy target. Tracks cumulative damage received.',

  baseAtk:      0,
  baseInterval: Infinity,
  maxHP:        Infinity,   // never dies

  // config.enemyDef: number (default 0)
  // config.enemyRes: number (default 0)

  talents: [],
  skills:  [],

  onInit(op, ctx) {
    op.def          = ctx.config.enemyDef ?? 0;
    op.res          = ctx.config.enemyRes ?? 0;
    op.totalDamage  = 0;
    op.hp           = Infinity;
  },

  // Full updateHealth override — just accumulates damage, never modifies HP
  updateHealth(op, state, pendingEvents, ctx) {
    const incoming = pendingEvents.filter(
      e => e.ticksRemaining === 0 && e.targetId === op.id && e.type === 'damage'
    );
    for (const ev of incoming) {
      op.totalDamage += ev.amount;
      const attacker = state.ops[ev.sourceId];
      if (attacker) attacker.totalDamage += ev.amount;
      if (attacker?._def.onDamageLanded)
        attacker._def.onDamageLanded(attacker, op, ev.amount, ctx);
    }
  },

  // canAttack / findTarget / onAttack: not implemented — enemy doesn't act
};
