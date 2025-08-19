import { SafeServer } from './server';
import mongoose from 'mongoose';
import pullJobScheduler from './server/pullJobScheduler';
import { startDatabase } from './server/database';
import config from 'config';
import logger from '@lib/logger';
import { checkConfig } from '@utils/server/checkConfig.util';
import buildSchema from '@utils/schema/buildSchema';
import koboSyncScheduler from './server/koboSyncScheduler';
import { setupNotificationScheduler } from '@server/components/notification/notification-scheduler';
import { PubSub } from 'graphql-subscriptions';

// Needed for survey.model, as xmlhttprequest is not defined in servers
global.XMLHttpRequest = require('xhr2');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    /** Express request interface definition */
    interface Request {
      context: any;
    }
  }
}

// Ensure that all mandatory keys exist
checkConfig();

/** SafeServer server port */
const PORT = config.get('server.port');

/** Starts the server */
const launchServer = async () => {
  const pubsub = new PubSub();
  const schema = await buildSchema(pubsub);
  const safeServer = new SafeServer(pubsub);
  await safeServer.start(schema);
  safeServer.httpServer.listen(PORT, () => {
    logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`🚀 Server ready at ws://localhost:${PORT}/graphql`);
  });
  safeServer.status.on('ready', () => {
    safeServer.httpServer.listen(PORT, () => {
      logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
      logger.info(`🚀 Server ready at ws://localhost:${PORT}/graphql`);
    });
  });
  setupNotificationScheduler(safeServer.pubsub);
};

startDatabase();
mongoose.connection.once('open', () => {
  logger.log({ level: 'info', message: '📶 Connected to database' });
  launchServer();
  pullJobScheduler();
  koboSyncScheduler();
});
