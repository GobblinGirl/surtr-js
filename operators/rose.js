'use strict';

// ═══════════════════════════════════════════════════════════
//  ROSE SALT — Liberi · Multi-Target Medic
//  E2 stats with S1 M3 mastery
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'rose',
  label:       'Rose Salt',
  short:       'RSE',
  color:       '#d45f7a',
  attackType:  'healing',
  desc:        'Multi-target medic · 3 targets',

  baseAtk:     335,
  baseInterval: 2.85,
  maxHP:       Infinity,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Rose\'s Whisper (NOT YET IMPLEMENTED)',
      description:
        'When healing an ally, also heals the 2 other allies with lowest HP in range. ' +
        'Not fully simulated - just heals Surtr directly in this sim.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'rose_s1',
      label:           'S1 – Top Notch Emergency Meds (AFK)',
      description:
        'Auto-activated. Heals 3 targets for 190% ATK (M3). ' +
        'Has charges: M3 = 2 charges, 8s recharge time.',
      spCost:          8,
      spMax:           16,
      spType:          'time',
      duration:        Infinity,
      defaultSelected: true,
    },
  ],

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS1      = skillKey === 'rose_s1';

    if (hasS1) {
      op.spType = 'time';
      op.spMax  = 16;  // M3 has 2 charges
      op.spCost = 8;
      op.s1Pct  = 1.90; // M3 190% ATK
    }

    // S1 is always active (AFK skill)
    op.s1Active = true;
  },

  isSkillActive(op, ctx) {
    return op.activeSkillKey === 'rose_s1';
  },

  isSpTimerPaused(op, ctx) {
    // Timer pauses when skill is active (infinite duration) or SP is full
    return op.skillActive || op.sp >= op.spMax;
  },

  findTarget(op, ctx, hpSnap) {
    const surtr = ctx.ops['surtr'];
    if (!surtr) return null;
    return surtr.hp < surtr.maxHP ? surtr : null;
  },

  onAttack(op, target, ctx, hpSnap, pendingEvents, willTriggerSkill) {
    // Use charge if available
    const useCharge = op.sp >= op.spCost;
    if (useCharge) {
      op.sp -= op.spCost;
      op.spTimer = 0;
      op.procCount++;
    }

    const atk = ctx.resolveAtk(op.baseAtk, op.buffs);
    const healPct = useCharge ? op.s1Pct : 1.0; // 190% with charge, 100% without
    const healAmt = atk * healPct * 1.17 * ctx.resolveHealReceived(target.buffs);

    pendingEvents.push({
      type:           'heal',
      sourceId:       op.id,
      targetId:       target.id,
      amount:         healAmt,
      ticksRemaining: 0,
    });
  },
};