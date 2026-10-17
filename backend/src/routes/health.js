'use strict';
const express = require('express');
const { isSeeded } = require('../domain/seed/reset');

const router = express.Router();

// 200 only when the database is reachable and the baseline is seeded (spec 07). Never rate limited.
router.get('/health', async (req, res) => {
  try {
    if (await isSeeded()) return res.status(200).json({ status: 'ok' });
  } catch { /* database not reachable yet */ }
  res.status(503).json({ status: 'starting' });
});

module.exports = router;
