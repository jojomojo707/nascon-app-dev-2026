'use strict';
const { pool } = require('../../db/pool');
const { conflict, notFound } = require('../../lib/errors');
const { validateSportConfig } = require('./config');

async function createSport(body) {
  const config = validateSportConfig(body);
  const r = await pool.query('INSERT INTO sports (sport_id, config) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [config.sport_id, config]);
  if (r.rowCount === 0) throw conflict('SPORT_EXISTS', `Sport ${config.sport_id} already exists.`, { sport_id: config.sport_id });
  return { sport_id: config.sport_id, status: 'created', config };
}

async function getSport(sportId, client = pool) {
  const r = await client.query('SELECT config FROM sports WHERE sport_id = $1', [sportId]);
  if (!r.rowCount) throw notFound('SPORT_NOT_FOUND', `Sport ${sportId} does not exist.`, { sport_id: sportId });
  return r.rows[0].config;
}

module.exports = { createSport, getSport };
