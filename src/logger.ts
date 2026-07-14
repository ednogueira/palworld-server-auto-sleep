import pino from 'pino';
import type { LogLevel } from './config';

export function createLogger(level: LogLevel): pino.Logger {
  return pino({
    level,
    redact: {
      paths: ['config.restApiPassword', 'restApiPassword', 'password'],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
