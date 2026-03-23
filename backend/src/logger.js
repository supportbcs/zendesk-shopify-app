function createLogger(baseContext = {}) {
  function log(severity, message, context = {}) {
    const entry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      ...baseContext,
      ...context,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  return {
    info: (message, context) => log('INFO', message, context),
    warn: (message, context) => log('WARNING', message, context),
    error: (message, context) => log('ERROR', message, context),
    child: (childContext) => createLogger({ ...baseContext, ...childContext }),
  };
}

const logger = createLogger();

module.exports = { createLogger, logger };
