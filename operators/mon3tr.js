'use strict';

// ═══════════════════════════════════════════════════════════
//  MON3TR — Therops · Chain Medic
//  E2 stats (trust bonuses not simulated)
// ═══════════════════════════════════════════════════════════

module.exports = {
  id:          'mon3tr',
  label:       'Mon3tr',
  short:       'M3',
  color:       '#185fa5',
  attackType:  'healing',
  desc:        'Chain medic · Reconstruction up',

  baseAtk:     522,
  baseInterval: 2.85,
  maxHP:       5000,

  // ── Talents ─────────────────────────────────────────────
  talents: [
    {
      label: 'Reconstruction',
      description:
        'Summons a Reconstruction drone that cannot be targeted by enemies. ' +
        'Heals Mon3tr for 80 HP/s when within 8 tiles. ' +
        'In this sim: Reconstruction is always present when Mon3tr is deployed.',
    },
  ],

  // ── Skills ──────────────────────────────────────────────
  skills: [
    {
      key:             'mon3tr_s2',
      label:           'S2 – Stratagem Overload (manual)',
      description:
        'Manual activation, 15 SP cost. ' +
        'When Mon3tr heals below 50% HP ally, triggers S2 auto-attack. ' +
        'Auto-triggers when Surtr <50% HP for ≥2s over last 4s, and Warfarin has 0 charges. ' +
        'During S2: +50 ASPD, prioritizes Reconstruction, 18 ticks later Reconstruction echoes attack.',
      spCost:          15,
      spMax:           15,
      spType:          'offensive',
      duration:        300, // 10s
      defaultSelected: false,
    },
  ],

  // ═══════════════════════════════════════════════════════════
  //  HOOKS
  // ═══════════════════════════════════════════════════════════

  onInit(op, ctx) {
    const skillKey   = op.activeSkillKey;
    const hasS2      = skillKey === 'mon3tr_s2';

    if (hasS2) {
      op.spType = 'offensive';
      op.spMax  = 15;
      op.spCost = 15;
    }

    // Reconstruction is a pseudo-operator that follows Mon3tr's position
    // It gets created in the engine when Mon3tr is deployed
  },

  isSkillActive(op, ctx) {
    return op.skillActive;
  },

  isSpTimerPaused(op, ctx) {
    // SP timer pauses when skill is active or SP is full
    return op.skillActive || op.sp >= op.spMax;
  },

  findTarget(op, ctx, hpSnap) {
    const surtr = ctx.ops['surtr'];
    const recon = ctx.ops['reconstruct'];

    // During S2: prioritize Reconstruction if it's below max HP
    if (op.skillActive && recon && recon.hp < recon.maxHP) {
      return recon;
    }

    // Otherwise prioritize Surtr if below 100%, then Reconstruction
    if (surtr && surtr.hp < surtr.maxHP) {
      return surtr;
    }
    if (recon && recon.hp < recon.maxHP) {
      return recon;
    }

    return null;
  },

  onAttack(op, target, ctx, hpSnap, pendingEvents) {
    const healAmt = ctx.resolveAtk(op.baseAtk, op.buffs) * ctx.resolveHealReceived(target.buffs);

    // Queue primary heal
    pendingEvents.push({
      type:           'heal',
      sourceId:       op.id,
      targetId:       target.id,
      amount:         healAmt,
      ticksRemaining: 0,
      grantASPD:      true,
      aspdStrength:  (op.skillActive || ctx.config.mon3trS2Active) ? 50 : 20,
    });

    // Fire bounce chain from target's position
    const targetPos = ctx.config.getOperatorPosition(target.id);
    if (targetPos) {
      fireChain(ctx, op, targetPos, 2, [target.id], pendingEvents);
    }

    // S2 echo: Reconstruction fires its own attack 18 ticks later
    if (op.skillActive || ctx.config.mon3trS2Active) {
      const reconPos = ctx.config.getOperatorPosition('reconstruct');
      if (reconPos) {
        pendingEvents.push({
          type:           '__echo__',
          sourceId:       op.id,
          targetId:       'reconstruct',
          amount:         0,
          ticksRemaining: 18,
          echoOriginPos:  reconPos,
          grantASPD:      true,
          aspdStrength:   50,
        });
      }
    }

    op.procCount++;
    ctx.log('mon3tr_attack', { tick: ctx.tick, t: ctx.t, target: target.id, healAmt: Math.round(healAmt) });
  },

  // Custom SP spend for S2 auto-trigger
  onSpend(op, target, ctx) {
    // Gain 1 SP per attack (offensive recovery)
    op.sp = Math.min(op.spMax, op.sp + 1);

    // Check for S2 auto-trigger
    if (op.activeSkillKey === 'mon3tr_s2' && !op.skillActive) {
      const surtr = ctx.ops['surtr'];
      if (surtr && surtr.hp / surtr.maxHP < 0.5 && ctx.config.mon3trLowHpTime >= 2.0) {
        // Check Warfarin charges
        const wf = ctx.ops['warfarin'];
        const wfCharges = wf && wf._def?.onSpend ? Math.floor(wf.sp / wf.spCost) : 999;

        if (wfCharges === 0) {
          // Trigger S2
          op.skillActive = true;
          op.skillDuration = 300;
          op.sp = 0;
          ctx.config.mon3trS2Active = true;
          ctx.log('mon3tr_s2_activate', { tick: ctx.tick, t: ctx.t });
        }
      }
    }
  },

  // Handle echo events
  onEchoFire(op, echoData, ctx, pendingEvents) {
    // Reconstruction fires its own attack, targeting itself first
    const healAmt = ctx.resolveAtk(op.baseAtk, op.buffs) * ctx.resolveHealReceived(ctx.ops['reconstruct'].buffs);

    pendingEvents.push({
      type:           'heal',
      sourceId:       'reconstruct',
      targetId:       'reconstruct',
      amount:         healAmt,
      ticksRemaining: 0,
      grantASPD:      true,
      aspdStrength:   50,
    });

    // 3 paid bounces from Reconstruction's position
    const reconPos = ctx.config.getOperatorPosition('reconstruct');
    if (reconPos) {
      fireChain(ctx, op, reconPos, 3, ['reconstruct'], pendingEvents);
    }
  },

  onBuffsExpired(op, ctx) {
    // S2 expired
    if (op.skillActive && op.skillDuration === 0) {
      op.skillActive = false;
      ctx.config.mon3trS2Active = false;
    }
  },
};

// ═══════════════════════════════════════════════════════════
//  Bounce chain helper
// ═══════════════════════════════════════════════════════════
function fireChain(ctx, originOp, startPos, bouncesLeft, excludeIds, pendingEvents) {
  if (bouncesLeft <= 0 || !startPos) return;

  // Get all operators and their positions
  const allOps = Object.values(ctx.ops).filter(op => op.id !== originOp.id && op.id !== 'reconstruct');

  // Find adjacent operators to startPos
  const candidates = [];
  for (const op of allOps) {
    const pos = ctx.config.getOperatorPosition(op.id);
    if (!pos) continue;
    if (excludeIds.includes(op.id)) continue;

    // Check adjacency (within 8 surrounding tiles)
    const dr = Math.abs(pos.row - startPos.row);
    const dc = Math.abs(pos.col - startPos.col);
    if (dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0)) {
      // Sort by lowest HP percentage
      const hpPct = op.hp / op.maxHP;
      candidates.push({ op, hpPct, deployOrder: ctx.config.deployOrder.indexOf(op.id) });
    }
  }

  if (candidates.length === 0) return;

  // Sort: lowest %HP first, tiebreak by deploy order (most recent first)
  candidates.sort((a, b) => {
    if (Math.abs(a.hpPct - b.hpPct) > 0.001) return a.hpPct - b.hpPct;
    return b.deployOrder - a.deployOrder;
  });

  const target = candidates[0].op;
  const healAmt = ctx.resolveAtk(originOp.baseAtk, originOp.buffs) * ctx.resolveHealReceived(target.buffs);

  pendingEvents.push({
    type:           'heal',
    sourceId:       originOp.id,
    targetId:       target.id,
    amount:         healAmt,
    ticksRemaining: 0,
    grantASPD:      true,
    aspdStrength:   (originOp.skillActive || ctx.config.mon3trS2Active) ? 50 : 20,
  });

  const targetPos = ctx.config.getOperatorPosition(target.id);
  const newExclude = [...excludeIds, target.id];

  // Reconstruction gives a free bounce (doesn't consume bouncesLeft)
  const isRecon = target.id === 'reconstruct';
  fireChain(ctx, originOp, targetPos, isRecon ? bouncesLeft : bouncesLeft - 1, newExclude, pendingEvents);
}