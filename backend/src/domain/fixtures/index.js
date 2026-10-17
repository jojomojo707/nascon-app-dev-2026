'use strict';
// POST /audit/v1/fixtures: pure computation, stores nothing (spec 09/10).
const { validation } = require('../../lib/errors');
const { isObject, isId } = require('../../lib/validate');
const { roundRobin } = require('./roundRobin');
const { swiss } = require('./swiss');
const { singleElim, doubleElim } = require('./elimination');

const FORMATS = {
  round_robin: { min: 2, max: 40, run: roundRobin },
  swiss: { min: 2, max: 64, run: swiss },
  single_elim: { min: 2, max: 128, run: singleElim },
  double_elim: { min: 3, max: 128, run: doubleElim },
};

function generateFixtures(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = FORMATS[body.format];
  const fields = [];
  if (!f) fields.push('format');
  const teams = body.teams;
  if (!Array.isArray(teams) || !teams.every(isId) || new Set(teams).size !== teams.length ||
    (f && (teams.length < f.min || teams.length > f.max))) fields.push('teams');
  if (body.params !== undefined && body.params !== null && !isObject(body.params)) fields.push('params');
  if (fields.length) throw validation(fields);
  return f.run(teams, body.params ?? {});
}

module.exports = { generateFixtures };
