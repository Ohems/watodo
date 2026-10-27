import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  enabled: config.logEnabled,
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export function createLogger(name: string): pino.Logger {
  return logger.child({ name });
}
