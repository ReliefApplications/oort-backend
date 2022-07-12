import { GraphQLError, GraphQLID, GraphQLNonNull } from 'graphql';
import { User } from '../../models';
import { UserType } from '../types';
import { AppAbility } from '../../security/defineAbilityFor';

/**
 * Get User by ID.
 * Throw an error if logged user does not have permissions to see user, there is no logged user, or ID is invalid.
 */
export default {
  type: UserType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
  },
  resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }

    const ability: AppAbility = context.user.ability;

    if (ability.can('read', 'User')) {
      try {
        return User.findById(args.id).populate({
          path: 'roles',
        });
      } catch {
        throw new GraphQLError(context.i18next.t('errors.dataNotFound'));
      }
    } else {
      throw new GraphQLError(context.i18next.t('errors.permissionNotGranted'));
    }
  },
};