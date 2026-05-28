type LogContext = {
  service: string;
  requestId?: string;
  organizationId?: string;
  instanceId?: string;
};

type LogData = Record<string, unknown>;

export function createLogger(context: LogContext) {
  function write(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: LogData) {
    const payload = {
      level,
      message,
      time: new Date().toISOString(),
      ...context,
      ...data,
    };

    const line = JSON.stringify(payload);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  return {
    debug: (message: string, data?: LogData) => write('debug', message, data),
    info: (message: string, data?: LogData) => write('info', message, data),
    warn: (message: string, data?: LogData) => write('warn', message, data),
    error: (message: string, data?: LogData) => write('error', message, data),
    child: (extra: Partial<LogContext>) => createLogger({ ...context, ...extra }),
  };
}
