'use strict';
// Grader contract routes (/audit/v1/*). No auth except the RBAC probes; never rate limited.
const express = require('express');
const { reset } = require('../../domain/seed/reset');
const sports = require('../../domain/sports/service');
const { generateFixtures } = require('../../domain/fixtures');

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

module.exports = router;
