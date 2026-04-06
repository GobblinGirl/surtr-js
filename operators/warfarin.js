'use strict';

// ═══════════════════════════════════════════════════════════
//  WARFARIN — Liberi · Single-Target Medic
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'warfarin',
  label:       'Warfarin',
  short:       'WAR',
  color:       '#8b4a8b',
  attackType:  'healing',
  desc:        'Single-target medic · S1 M3',

  baseAtk:     589,
  baseInterval: 2.85,
  maxHP:       Infinity,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'SP Charge on Kill (NOT SIMULATED)',
      description: 'Gains 1 SP when an enemy dies. No enemies in this sim.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'warfarin_s1',
      label:           'S1 – Emergency Triage (AFK)',
      description:
        'Auto-activated when target below 50% HP. ' +
        'Heals for ATK + 25% of target max HP. ' +
        'SP: 4 per attack, 12 SP max.',
      spCost:          4,
      spMax:           12,
      spType:          'offensive',
      duration:        Infinity,
      defaultSelected: true,
    },
  ],

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey = op.activeSkillKey;
    const hasS1    = skillKey === 'warfarin_s1';

    if (hasS1) {
      op.spType = 'offensive';
      op.spMax  = 12;
      op.spCost = 4;
    }
  },

  findTarget(op, ctx, hpSnap) {
    const surtr = ctx.ops['surtr'];
    if (!surtr) return null;
    return surtr.hp < surtr.maxHP ? surtr : null;
  },

  canAttack(op, ctx) {
    return op.attackCooldown === 0;
  },

  // Returns true if attack-modifying skill will trigger this attack
  willTriggerSkill(op, target, ctx) {
    const belowHalf = target.hp / target.maxHP < 0.5;
    const hasS1 = op.activeSkillKey === 'warfarin_s1';
    return hasS1 && belowHalf && op.sp >= op.spCost;
  },

  onAttack(op, target, ctx, hpSnap, pendingEvents, willTriggerSkill) {
    const belowHalf = target.hp / target.maxHP < 0.5;
    const hasS1 = op.activeSkillKey === 'warfarin_s1';

    // Calculate module bonus - applies to entire outgoing heal if target below 50%
    const moduleMult = belowHalf ? 1.15 : 1.0;

    if (hasS1 && belowHalf && willTriggerSkill) {
      // S1 triggers: spend SP, base = (ATK + 25% maxHP) × moduleMult
      op.sp -= op.spCost;
      
      const baseHeal = (op.baseAtk + (0.25 * target.maxHP)) * moduleMult;

      pendingEvents.push({
        type:           'heal',
        sourceId:       op.id,
        targetId:       target.id,
        amount:         baseHeal,
        ticksRemaining: 0,
      });

      op.procCount++;
      op.totalBonusHP = (op.totalBonusHP || 0) + (0.25 * target.maxHP) * moduleMult;
      ctx.log('warfarin_s1_proc', { tick: ctx.tick, t: ctx.t, bonus: Math.round(0.25 * target.maxHP * moduleMult) });
    } else {
      // Regular attack: base = ATK × moduleMult
      // SP is already gained in Step 2d by the engine (if skill didn't trigger)
      const baseHeal = op.baseAtk * moduleMult;

      pendingEvents.push({
        type:           'heal',
        sourceId:       op.id,
        targetId:       target.id,
        amount:         baseHeal,
        ticksRemaining: 0,
      });
    }
  },
};