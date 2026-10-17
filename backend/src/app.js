'use strict';
const express = require('express');
const { AppError, validation } = require('./lib/errors');

const MAX_BODY_BYTES = 1000000;

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  // RBAC probes authorize before anything else, including body parsing (spec 15).
  app.use('/audit/v1/rbac', require('./routes/audit/rbac'));

  // Parse every body as JSON regardless of Content-Type; bodies over 1 MB -> 413 (spec 04).
  // The limit is the stricter decimal 1 MB (1,000,000 bytes) so either reading of "1 MB" gets 413.
  app.use(express.json({ limit: MAX_BODY_BYTES, type: () => true, strict: true }));
  // NUL characters cannot be stored in Postgres text/JSONB; reject them as bad input (never a 5xx).
  app.use((req, res, next) => {
    if (req.body !== undefined && JSON.stringify(req.body).includes('\\u0000')) return next(validation(['body'], 'Strings must not contain NUL characters.'));
    next();
  });

  app.use(require('./routes/health'));
  app.use('/audit/v1', require('./routes/audit'));
  app.use('/api/v1', require('./routes/api'));

  app.use((req, res) => {
    res.status(404).json(new AppError(404, 'VALIDATION_ERROR', `Unknown route ${req.method} ${req.path}`, { fields: ['path'] }).toBody());
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let e = err;
    if (err && err.type === 'entity.too.large') {
      e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is larger than 1 MB.', { limit_bytes: MAX_BODY_BYTES });
    } else if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      e = validation(['body'], 'Malformed JSON body.');
    } else if (err && err.type && err.status && err.status < 500) {
      e = validation(['body'], err.message);
    } else if (!(err instanceof AppError)) {
      console.error('Unhandled error', err);
      e = new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error.', {});
    }
    res.status(e.status).json(e.toBody());
  });
  return app;
}

module.exports = { createApp, MAX_BODY_BYTES };
