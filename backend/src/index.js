const createApp = require('./app');
const config = require('./config');
const { validateConfig } = require('./config');
const { logger } = require('./logger');

validateConfig();

const app = createApp();

app.listen(config.port, () => {
  logger.info('Server started', { port: config.port });
});
