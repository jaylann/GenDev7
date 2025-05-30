/**
 * Logger utility for consistent, environment-aware logging
 * Only logs in development environment
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogStyles {
  prefix: string;
  style: string;
}

const LOG_STYLES: Record<LogLevel, LogStyles> = {
  info: {
    prefix: '🔵 INFO',
    style: 'color: #0ea5e9; font-weight: bold;'
  },
  warn: {
    prefix: '🟠 WARNING',
    style: 'color: #f59e0b; font-weight: bold;'
  },
  error: {
    prefix: '🔴 ERROR',
    style: 'color: #ef4444; font-weight: bold;'
  },
  debug: {
    prefix: '🟣 DEBUG',
    style: 'color: #8b5cf6; font-weight: bold;'
  }
};

const isDevelopment = process.env.NODE_ENV !== 'production';

export function formatLogMessage(level: LogLevel, source: string, message: string): string {
  return `${LOG_STYLES[level].prefix} [${source}] ${message}`;
}

export const logger = {
  info: (source: string, message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(
        `%c${LOG_STYLES.info.prefix} [${source}]%c ${message}`,
        LOG_STYLES.info.style,
        '',
        ...args
      );
    }
  },
  
  warn: (source: string, message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(
        `%c${LOG_STYLES.warn.prefix} [${source}]%c ${message}`,
        LOG_STYLES.warn.style,
        '',
        ...args
      );
    }
  },
  
  error: (source: string, message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.error(
        `%c${LOG_STYLES.error.prefix} [${source}]%c ${message}`,
        LOG_STYLES.error.style,
        '',
        ...args
      );
    }
  },
  
  debug: (source: string, message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(
        `%c${LOG_STYLES.debug.prefix} [${source}]%c ${message}`,
        LOG_STYLES.debug.style,
        '',
        ...args
      );
    }
  }
};