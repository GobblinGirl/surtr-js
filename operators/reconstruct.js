'use strict';

// ═══════════════════════════════════════════════════════════
//  RECONSTRUCTION — Pseudo-operator (summoned by Mon3tr)
//  Not a real Arknights operator; exists as a heal target and bounce source.
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'reconstruct',
  label:       'Reconstruction',
  short:       'REC',
  color:       '#2d6ea8',
  attackType:  'none',
  desc:        'Mon3tr summon · 80 HP/s drain · bounce chain',

  baseAtk:     0,
  baseInterval: Infinity,
  maxHP:       5000,
  hp:          5000,

  // No talents or skills - it's a drone

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    op.hp = 5000;
  },

  // Reconstruction doesn't attack
  canAttack(op, ctx) {
    return false;
  },

  // Reconstruction has continuous HP drain
  onTick(op, ctx) {
    // 80 HP/s drain, applied as discrete events every 6 ticks (16 HP per event)
    if (ctx.tick % 6 === 0 && ctx.tick > 0) {
      op.hp = Math.max(0, op.hp - 16);
    }
  },

  // Full updateHealth override - tracks damage but doesn't die
  updateHealth(op, state, pendingEvents, ctx) {
    const incoming = pendingEvents.filter(
      e => e.ticksRemaining === 0 && e.targetId === op.id && e.type === 'damage'
    );
    for (const ev of incoming) {
      op.totalDamage += ev.amount;
      const attacker = state.ops[ev.sourceId];
      if (attacker) attacker.totalDamage += ev.amount;
      if (attacker?._def?.onDamageLanded) {
        attacker._def.onDamageLanded(attacker, op, ev.amount, ctx);
      }
    }

    // Reconstruction never dies - clamp to 0 or stay at current
    if (op.hp <= 0) {
      op.hp = 0;
    }
  },
};