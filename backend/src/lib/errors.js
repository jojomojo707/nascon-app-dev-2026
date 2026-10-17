'use strict';
// Every non-2xx body is {"error":{"code","message","details":{}}} (spec 04). Codes come only from spec 05.

class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details && typeof details === 'object' ? details : {};
  }
  toBody() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

const validation = (fields, message = 'Request validation failed.') =>
  new AppError(400, 'VALIDATION_ERROR', message, { fields: [...new Set(fields)] });
const notFound = (code, message, details = {}) => new AppError(404, code, message, details);
const conflict = (code, message, details = {}) => new AppError(409, code, message, details);

module.exports = { AppError, validation, notFound, conflict };
