'use strict';

// ═══════════════════════════════════════════════════════════
//  LUMEN — Liberi · Wandering Medic
//  (investment level not specified — base stats used)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:    'lumen',
  label: 'Lumen',
  short: 'LMN',
  color: '#4a7ab5',
  role:  'healer',
  desc:  'Wandering medic · 100% ATK heal · extended range',

  baseAtk:      579,
  baseInterval: 2.85,
  maxHP:        Infinity,   // not tracked for medics

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: "Pegasus' Halo (NOT SIMULATED)",
      description:
        'When Lumen heals a target, grants 4 seconds of Status Resistance ' +
        '(halves the next debuff received), or 6 seconds if they are above 75% HP. ' +
        'Not simulated — no debuffs in this scenario.',
    },
    {
      label: 'Bonus Attack (NOT SIMULATED)',
      description:
        '8-second cooldown. Stores a bonus attack that fires on an ally ' +
        'at the same time as his next attack if they have a negative status, ' +
        'healing for 80% ATK. Not simulated — Surtr has no negative statuses.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'lumen_s3',
      label:           'S3 – This Lantern Undying',
      description:
        'Manual activation. Infinite duration once active. ' +
        'ATK +55%, ASPD +30. Prioritizes healing targets with negative statuses (not simulated). ' +
        'Grants 8 ammo; consuming ammo on a status-afflicted target cleanses it and heals for 200% ATK. ' +
        'Ammo is never consumed in this scenario (Surtr has no negative statuses), ' +
        'so the skill effectively grants permanent ATK +55% and ASPD +30.',
      spCost:          50,
      spMax:           50,
      spType:          'time',
      defaultSelected: true,
    },
    {
      key:             'lumen_base',
      label:           'No skill',
      description:     'Base healing only.',
      spCost:          null,
      spMax:           null,
      spType:          'none',
      defaultSelected: false,
    },
  ],

  // ── Config ──────────────────────────────────────────────
  // config.lumenPrecharged: bool — S3 active from tick 1

  // ── Internal state keys ──────────────────────────────────
  // op.s3Active: bool — is S3 currently active

  // ═══════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS3      = skillKey === 'lumen_s3';
    const precharged = hasS3 && (ctx.config.lumenPrecharged ?? false);

    op.s3Active = false;

    if (hasS3) {
      op.spType = 'time';
      op.spMax  = 50;
      op.spCost = 50;

      if (precharged) {
        // S3 already active — apply buffs immediately
        op.sp       = 50;
        op.s3Active = true;
        _applyS3Buffs(op, ctx);
      } else {
        op.sp      = 0;
        op.spTimer = 0;
      }
    }
  },

  // SP timer paused when S3 is active (infinite duration, no need to recharge)
  isSpTimerPaused(op, ctx) {
    return op.s3Active || op.sp >= op.spMax;
  },

  onTick(op, ctx) {
    // Check if SP just reached max and S3 should auto-activate
    if (op.activeSkillKey === 'lumen_s3' && !op.s3Active && op.sp >= op.spCost) {
      op.s3Active = true;
      op.sp       = op.spMax; // keep full for display; skill is permanent
      _applyS3Buffs(op, ctx);
      ctx.log('lumen_s3_active', { tick: ctx.tick, t: ctx.t });
    }
  },

  // canAttack: default (cooldown === 0) — no override needed

  // findTarget: default (Surtr below 100% HP) — no override needed

  onAttack(op, target, ctx, hpSnap, pendingEvents) {
    const healAmt = ctx.resolveAtk(op.baseAtk, op.buffs);
    pendingEvents.push({
      type:           'heal',
      sourceId:       op.id,
      targetId:       target.id,
      amount:         healAmt,
      ticksRemaining: 0,
    });
  },

  isSkillActive(op, ctx) {
    return op.s3Active;
  },
};

// ── Private helpers ──────────────────────────────────────
function _applyS3Buffs(op, ctx) {
  // ATK +55% ratio buff + ASPD +30 ratio buff, permanent once active
  op.buffs.push(ctx.makeBuff({
    type:   'lumen_s3',
    source: 'lumen',
    mods: [
      { stat: 'atk',  kind: 'ratio', value: 0.55 },
      { stat: 'aspd', kind: 'ratio', value: 30   },
    ],
    expiry: { condition: 'never' },
  }));
}
