import { GraphQLError, GraphQLList } from 'graphql';
import { PageType } from '../types';
import { Application, Page } from '@models';
import { AppAbility } from '@security/defineUserAbility';
import extendAbilityForPage from '@security/extendAbilityForPage';
import { logger } from '@lib/logger';
import { accessibleBy } from '@casl/mongoose';
import { graphQLAuthCheck } from '@schema/shared';
import { Context } from '@server/apollo/context';
import GraphQLJSON from 'graphql-type-json';
import getFilter from '@utils/filter/getFilter';

/** Default filter fields */
const FILTER_FIELDS: { name: string; type: string }[] = [
  {
    name: 'name',
    type: 'text',
  },
  {
    name: 'type',
    type: 'text',
  },
  {
    name: 'visible',
    type: 'boolean',
  },
];

/**
 * List all pages available for the logged user.
 * Throw GraphQL error if not logged.
 */
export default {
  type: new GraphQLList(PageType),
  args: {
    filter: { type: GraphQLJSON },
  },
  async resolve(parent, args, context: Context) {
    graphQLAuthCheck(context);
    try {
      const user = context.user;
      // create ability object for all pages
      let ability: AppAbility = user.ability;
      const applications = await Application.find(
        accessibleBy(ability, 'read').Application
      );
      for (const application of applications) {
        ability = await extendAbilityForPage(user, application, ability);
      }

      const abilityFilters = Page.find(accessibleBy(ability, 'read')).getFilter();
      const queryFilters = getFilter(args.filter, FILTER_FIELDS);
      const filters = [queryFilters, abilityFilters];

      // return the pages with filters applied
      return await Page.find({ $and: filters });
    } catch (err) {
      logger.error(err.message, { stack: err.stack });
      if (err instanceof GraphQLError) {
        throw new GraphQLError(err.message);
      }
      throw new GraphQLError(
        context.i18next.t('common.errors.internalServerError')
      );
    }
  },
};
