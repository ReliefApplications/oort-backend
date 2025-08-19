import { User } from '@models';
import { NotificationType } from '../types';
import { Context } from '@server/apollo/context';
import { PubSub } from 'graphql-subscriptions';

/**
 * Subscription to detect new notifications.
 * TODO: rethink how logs are created in the system.
 *
 * @param pubsub PubSub
 * @returns GraphQL Subscription
 */
const notification = (pubsub: PubSub) => ({
  type: NotificationType,
  subscribe: (parent, args, context: Context) => {
    // Subscribe to channels available in user's roles
    const user: User = context.user;
    return pubsub.asyncIterator(
      user.roles
        .map((role) => role.channels.map((x) => String(x._id)))
        .flat()
        .concat([user._id.toString()])
    );
  },
});

export default notification;
