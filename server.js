'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

const ENGINE_PATH   = path.join(__dirname, 'engine.js');
const OPERATORS_DIR = path.join(__dirname, 'operators');
const PUBLIC_DIR    = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// GET /operators — returns all operator module code
app.get('/operators', (req, res) => {
  const files  = fs.readdirSync(OPERATORS_DIR).filter(f => f.endsWith('.js'));
  const result = {};
  for (const file of files) {
    const id   = file.replace('.js', '');
    const code = fs.readFileSync(path.join(OPERATORS_DIR, file), 'utf8');
    result[id] = code;
  }
  res.json(result);
});

// POST /run — run simulation with config
app.post('/run', (req, res) => {
  try {
    const { operatorDefs, config } = req.body;
    const engine = require(ENGINE_PATH);
    const state = engine.runSim(operatorDefs, config);
    
    // Compute summary stats
    const surtr = state.ops['surtr'];
    const maxHP = surtr?.maxHP || 7680;
    const peakDrain = 0.20 * maxHP;
    const avgHPS = state.totalHeal / (state.lifetime || 300);
    const lateAvgHPS = state.totalHealLate 
      ? state.totalHealLate / Math.min(120, Math.max(state.lifetime - 180, 1))
      : avgHPS;
    
    res.json({
      lifetime: state.lifetime,
      surtr: {
        hp: surtr?.hp || 0,
        maxHP: maxHP,
        totalHealing: surtr?.totalHealing || 0,
        totalDamage: surtr?.totalDamage || 0,
      },
      operators: Object.values(state.ops).map(op => ({
        id: op.id,
        label: op.label,
        totalHealing: op.totalHealing,
        totalDamage: op.totalDamage,
        procCount: op.procCount,
      })),
      replayEvents: state.replayEvents,
      hpSnap: state.hpSnap,
      drainSnap: state.drainSnap,
      healSnap: state.healSnap,
      stats: {
        avgHPS,
        lateAvgHPS,
        peakDrain,
        sustainable: lateAvgHPS >= peakDrain,
      },
    });
  } catch (err) {
    console.error('Simulation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Surtr Sim running at http://localhost:${PORT}`);
});