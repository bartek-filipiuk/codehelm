import pino from 'pino';

const REDACT_PATHS = [
  'token',
  '*.token',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'headers.cookie',
  'headers.authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  'env',
  '*.env',
];

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
