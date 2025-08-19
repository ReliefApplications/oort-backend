import { GraphQLSchema } from 'graphql';
import Query from './query';
import subscription from './subscription';
import { PubSub } from 'graphql-subscriptions';
import mutation from './mutation';

/**
 * Create the default GraphQL schema.
 *
 * @param pubsub PubSub
 * @returns Schema
 */
const createSchema = (pubsub: PubSub) => {
  return new GraphQLSchema({
    query: Query,
    mutation: mutation(pubsub),
    subscription: subscription(pubsub),
  });
};

export default createSchema;
