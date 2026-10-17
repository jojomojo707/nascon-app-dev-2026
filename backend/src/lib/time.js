'use strict';
// Timestamps are YYYY-MM-DDTHH:MM:SSZ; dates are YYYY-MM-DD (spec 04).

const nowTimestamp = (d = new Date()) => d.toISOString().slice(0, 19) + 'Z';
const today = (d = new Date()) => d.toISOString().slice(0, 10);

function addDays(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { nowTimestamp, today, addDays };
