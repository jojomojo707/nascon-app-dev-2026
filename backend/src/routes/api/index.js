'use strict';
// Mobile app routes (/api/v1/*): rate limited, JWT-authenticated thin wrappers over the domain services.
const express = require('express');
const { createLimiter } = require('../../middleware/rateLimit');

const router = express.Router();
router.use(createLimiter().middleware);

router.get('/ping', (req, res) => res.status(200).json({ pong: true }));

module.exports = router;
