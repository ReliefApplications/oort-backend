import { GraphQLError, GraphQLList } from 'graphql';
import { PageType } from '../types';
import { Application, Page } from '../../models';
import { AppAbility } from '../../security/defineUserAbility';
import extendAbilityOnApplication from '../../security/extendAbilityOnApplication';

/**
 * List all pages available for the logged user.
 * Throw GraphQL error if not logged.
 */
export default {
  type: new GraphQLList(PageType),
  async resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }

    // create ability object for all pages
    let ability: AppAbility = user.ability;
    const applications = await Application.accessibleBy(ability, 'read').find();
    for (const application of applications) {
      ability = await extendAbilityOnApplication(user, application, ability);
    }

    // return the pages
    return Page.accessibleBy(ability, 'read').find();
  },
};
