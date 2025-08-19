import { GraphQLID } from 'graphql';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { RecordType } from '../types';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the recordAdded subscription */
type RecordAddedArgs = {
  resource?: string | Types.ObjectId;
  form?: string | Types.ObjectId;
};
/**
 * Subscription to detect addition of record.
 *
 * @param pubsub PubSub
 * @returns GraphQL Subscription
 */
const recordAdded = (pubsub: PubSub) => ({
  type: RecordType,
  args: {
    resource: { type: GraphQLID },
    form: { type: GraphQLID },
  },
  subscribe: (parent, args: RecordAddedArgs, context: Context) => {
    return withFilter(
      () => pubsub.asyncIterator('record_added'),
      (payload, variables) => {
        if (variables.resource) {
          return payload.recordAdded.resource === variables.resource;
        }
        if (variables.form) {
          return payload.recordAdded.form === variables.form;
        }
        return true;
      }
    )(parent, args, context);
  },
});

export default recordAdded;
