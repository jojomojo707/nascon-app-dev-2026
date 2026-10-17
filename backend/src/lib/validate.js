'use strict';
// Small validation helpers shared by every endpoint. Each returns true when the value is valid.

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isBool = (v) => typeof v === 'boolean';
const isString = (v, min = 1, max = Infinity) => typeof v === 'string' && v.length >= min && v.length <= max;

function isDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isTimestamp(v) {
  if (typeof v !== 'string' || !TS_RE.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19) + 'Z' === v;
}

function uniqueStrings(arr) {
  return new Set(arr).size === arr.length;
}

module.exports = { ID_RE, isObject, isId, isInt, isBool, isString, isDate, isTimestamp, uniqueStrings };
