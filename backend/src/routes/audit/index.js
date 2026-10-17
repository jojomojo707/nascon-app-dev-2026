'use strict';
// Grader contract routes (/audit/v1/*). No auth except the RBAC probes; never rate limited.
const express = require('express');
const { reset } = require('../../domain/seed/reset');
const sports = require('../../domain/sports/service');
const { generateFixtures } = require('../../domain/fixtures');
const scoring = require('../../domain/scoring/service');

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

module.exports = router;
