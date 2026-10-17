'use strict';
// The 7 RBAC probe routes (spec 15). Authentication and authorization run before anything else;
// probes never mutate and never validate the body.
const express = require('express');
const rbac = require('../../domain/rbac/service');
const { AppError } = require('../../lib/errors');

const router = express.Router();
const MAX_BODY = 1000000;

const probe = (action, kind, param) => async (req, res) => {
  const principal = rbac.principalFrom(req);
  const tgt = await rbac.target(kind, param ? req.params[param] : null);
  rbac.assertAllowed(principal, action, tgt);
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is larger than 1 MB.', { limit_bytes: MAX_BODY });
  }
  res.status(200).json({ authorized: true });
};

router.post('/tenants', probe('tenant.create', 'platform'));
router.post('/leagues/:league_id/fixtures', probe('league.fixtures.write', 'league', 'league_id'));
router.post('/clubs/:club_id/roster', probe('club.roster.write', 'club', 'club_id'));
router.post('/clubs/:club_id/products', probe('club.products.write', 'club', 'club_id'));
router.patch('/players/:player_id', probe('player.update', 'player', 'player_id'));
router.get('/clubs/:club_id', probe('club.read', 'club', 'club_id'));
router.get('/platform/config', probe('platform.config.read', 'platform'));

module.exports = router;
