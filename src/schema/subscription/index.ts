import { GraphQLObjectType } from 'graphql';
import applicationUnlocked from './applicationUnlocked.subscription';
import applicationEdited from './applicationEdited.subscription';
import notification from './notification.subscription';
import recordAdded from './recordAdded.subscription';
import { PubSub } from 'graphql-subscriptions';

/**
 * Build subscription field Object type
 *
 * @param pubsub PubSub
 * @returns GraphQLObjectType
 */
const subscription = (pubsub: PubSub) => {
  return new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      applicationUnlocked: applicationUnlocked(pubsub),
      applicationEdited: applicationEdited(pubsub),
      notification: notification(pubsub),
      recordAdded: recordAdded(pubsub),
    },
  });
};

export default subscription;
