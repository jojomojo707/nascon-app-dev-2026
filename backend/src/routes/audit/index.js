'use strict';
// Grader contract routes (/audit/v1/*). No auth except the RBAC probes; never rate limited.
const express = require('express');
const { reset } = require('../../domain/seed/reset');
const sports = require('../../domain/sports/service');
const { generateFixtures } = require('../../domain/fixtures');
const scoring = require('../../domain/scoring/service');
const { getStandings } = require('../../domain/standings/service');
const roster = require('../../domain/roster/service');
const store = require('../../domain/store/service');

const router = express.Router();

router.post('/reset', async (req, res) => {
  res.status(200).json(await reset(req.body));
});

router.post('/sports', async (req, res) => {
  res.status(201).json(await sports.createSport(req.body));
});

router.post('/fixtures', (req, res) => {
  res.status(200).json(generateFixtures(req.body));
});

router.post('/leagues', async (req, res) => {
  res.status(201).json(await scoring.createLeague(req.body));
});

router.post('/events', async (req, res) => {
  const r = await scoring.appendEvent(req.body);
  res.status(r.status).json(r.body);
});

router.get('/score/:match_id', async (req, res) => {
  res.status(200).json(await scoring.getScore(req.params.match_id));
});

router.get('/standings/:league_id', async (req, res) => {
  res.status(200).json(await getStandings(req.params.league_id));
});

router.post('/roster/setup', async (req, res) => {
  res.status(201).json(await roster.setupRoster(req.body));
});

router.post('/roster/transfer', async (req, res) => {
  const r = await roster.transfer(req.body);
  res.status(r.status).json(r.body);
});

router.get('/roster/history/:player_id', async (req, res) => {
  res.status(200).json(await roster.history(req.params.player_id, req.query.as_of));
});

router.post('/checkout', async (req, res) => {
  const r = await store.checkout(req.body);
  res.status(r.status).json(r.body);
});

router.get('/inventory/:variant_id', async (req, res) => {
  res.status(200).json(await store.inventory(req.params.variant_id));
});

module.exports = router;
