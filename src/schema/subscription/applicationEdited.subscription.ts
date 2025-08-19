import { GraphQLID } from 'graphql';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { ApplicationType } from '../types';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the applicationEdited subscription */
type ApplicationEditedArgs = {
  id?: string | Types.ObjectId;
};

/**
 * Subscription to detect if application is being edited.
 *
 * @param pubsub PubSub
 * @returns GraphQL Subscription
 */
const applicationEdited = (pubsub: PubSub) => ({
  type: ApplicationType,
  args: {
    id: { type: GraphQLID },
  },
  subscribe: (parent, args: ApplicationEditedArgs, context: Context) => {
    graphQLAuthCheck(context);
    const user = context.user;
    return withFilter(
      () => pubsub.asyncIterator('app_edited'),
      (payload, variables) => {
        if (variables.id) {
          return (
            payload.application._id === variables.id &&
            payload.user !== user._id.toString()
          );
        }
        return false;
      }
    )(parent, args, context);
  },
  resolve: (payload) => {
    return payload.application;
  },
});

export default applicationEdited;
