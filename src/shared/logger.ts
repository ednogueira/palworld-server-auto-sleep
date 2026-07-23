import pino from 'pino';
import type { LogLevel } from './config';

function localIsoTime(): string {
  const date = new Date();
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');
  const tz = `${sign}${hours}:${minutes}`;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${String(date.getMilliseconds()).padStart(3, '0')}${tz}`
  );
}

export function createLogger(level: LogLevel): pino.Logger {
  return pino({
    level,
    redact: {
      paths: ['config.restApiPassword', 'restApiPassword', 'password'],
      censor: '[REDACTED]',
    },
    timestamp: localIsoTime,
  });
}
