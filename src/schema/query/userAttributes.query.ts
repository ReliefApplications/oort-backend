import { GraphQLList } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import config from 'config';
import { graphQLAuthCheck } from '@schema/shared';
import { Context } from '@server/apollo/context';

/**
 *
 */
export default {
  type: new GraphQLList(GraphQLJSON),
  async resolve(parent, args, context: Context) {
    graphQLAuthCheck(context);
    const availableAttributes: any[] = config.get('user.attributes.list') || [];
    return availableAttributes.filter((attr: any) => attr.showInList === true);
  },
};
