import { GraphQLID } from 'graphql';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { ApplicationType } from '../types';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the applicationUnlocked subscription */
type ApplicationUnlockedArgs = {
  id?: string | Types.ObjectId;
};

/**
 * Subscription to detect if application is unlocked.
 *
 * @param pubsub PubSub
 * @returns GraphQL Subscription
 */
const applicationUnlocked = (pubsub: PubSub) => ({
  type: ApplicationType,
  args: {
    id: { type: GraphQLID },
  },
  subscribe: (parent, args: ApplicationUnlockedArgs, context: Context) => {
    graphQLAuthCheck(context);
    return withFilter(
      () => pubsub.asyncIterator('app_lock'),
      (payload, variables) => {
        if (variables.id) {
          return payload.application._id === variables.id;
        }
        return false;
      }
    )(parent, args, context);
  },
  resolve: (payload) => {
    return payload.application;
  },
});

export default applicationUnlocked;
