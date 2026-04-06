'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

const OPERATORS_DIR = path.join(__dirname, 'operators');
const PUBLIC_DIR    = path.join(__dirname, 'public');

// Serve static files from public/
app.use(express.static(PUBLIC_DIR));

// GET /operators — returns all operator module code as a map of { id -> codeString }
// The client uses Function() to evaluate these into live objects.
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

app.listen(PORT, () => {
  console.log(`Surtr Sim running at http://localhost:${PORT}`);
});
