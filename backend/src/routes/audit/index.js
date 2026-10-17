'use strict';
// Grader contract routes (/audit/v1/*). No auth except the RBAC probes; never rate limited.
const express = require('express');
const { reset } = require('../../domain/seed/reset');

const router = express.Router();

router.post('/reset', async (req, res) => {
  res.status(200).json(await reset(req.body));
});

module.exports = router;
