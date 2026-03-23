const { cleanupOldCache } = require('../services/cacheCleanupService');
const { logger } = require('../logger');

async function main() {
  try {
    const result = await cleanupOldCache();
    logger.info('Cache cleanup job finished', result);
    process.exit(0);
  } catch (err) {
    logger.error('Cache cleanup job failed', { error: err.message });
    process.exit(1);
  }
}

main();
