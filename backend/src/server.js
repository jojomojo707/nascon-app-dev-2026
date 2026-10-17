'use strict';
// Boot: listen immediately (health says 503 until ready), wait for Postgres, create schema, seed if empty.
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./app');
const { pool } = require('./db/pool');
const { reset, isSeeded } = require('./domain/seed/reset');
const queue = require('./lib/queue');
const realtime = require('./lib/realtime');

const PORT = Number(process.env.PORT || 8080);

async function waitForDb(timeoutMs = 90000) {
  const start = Date.now();
  for (;;) {
    try { await pool.query('SELECT 1'); return; } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function main() {
  if (!process.env.DAY1_SALT) console.warn('WARNING: DAY1_SALT is empty; signatures will use an empty key.');
  const app = createApp();
  const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  server.requestTimeout = 15000;
  realtime.attach(server);

  await waitForDb();
  await pool.query('SELECT pg_advisory_lock(42000)');
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
    if (!(await isSeeded())) {
      await reset({});
      console.log('Baseline seeded.');
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock(42000)');
  }
  queue.connect();
}

main().catch((err) => { console.error('Startup failed', err); process.exit(1); });
