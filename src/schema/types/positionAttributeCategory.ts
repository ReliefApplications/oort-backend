import { GraphQLObjectType, GraphQLID, GraphQLString } from 'graphql';
import { AppAbility } from '../../security/defineUserAbilities';
import { Application } from '../../models';
import { ApplicationType } from './application';

/** GraphQL position attribute category type definition */
export const PositionAttributeCategoryType = new GraphQLObjectType({
  name: 'PositionAttributeCategory',
  fields: () => ({
    id: { type: GraphQLID },
    title: { type: GraphQLString },
    application: {
      type: ApplicationType,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return Application.findById(parent.application).accessibleBy(
          ability,
          'read'
        );
      },
    },
  }),
});
