import { GraphQLNonNull, GraphQLString, GraphQLError } from 'graphql';
import { Group } from '../../models';
import { AppAbility } from '../../security/defineUserAbility';
import { GroupType } from '../types';
import config from 'config';

/**
 * Creates a new group.
 * Throws an error if not logged or authorized.
 */
export default {
  type: GroupType,
  args: {
    title: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(parent, args, context) {
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }

    if (!config.get('groups.manualCreation')) {
      throw new GraphQLError(
        context.i18next.t('errors.groupsManualCreationDisabled')
      );
    }

    const ability: AppAbility = user.ability;

    const group = new Group({
      title: args.title,
    });
    if (ability.can('create', group)) {
      return group.save();
    }
    throw new GraphQLError(context.i18next.t('errors.permissionNotGranted'));
  },
};