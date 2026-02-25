import { GraphQLNonNull, GraphQLError, GraphQLID } from 'graphql';
import { User } from '@models';
import { UserProfileArgs, UserProfileInputType } from '../inputs';
import { UserType } from '../types';
import { AppAbility } from '@security/defineUserAbility';
import permissions from '@const/permissions';
import config from 'config';
import { isEmpty, get } from 'lodash';
import { logger } from '@lib/logger';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the editUserProfile mutation */
type EditUserProfileArgs = {
  profile: UserProfileArgs;
  id?: string | Types.ObjectId;
};

/** User attribute key used for assigned country. */
const COUNTRY_ATTRIBUTE = 'country';

/**
 * Edit User profile.
 * If a user ID is used as argument, the profile of the user corresponding to the id will be updated, if current user has permission to do so.
 * Otherwise, profile of current user will be updated.
 */
export default {
  type: UserType,
  args: {
    profile: { type: new GraphQLNonNull(UserProfileInputType) },
    id: { type: GraphQLID },
  },
  async resolve(parent, args: EditUserProfileArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const currentUser = context.user;
      const ability: AppAbility = currentUser.ability;
      const availableAttributes: {
        value: string;
        text: string;
        userCanEdit: boolean;
      }[] = config.get('user.attributes.list') || [];
      const isEditingAnotherUser =
        !!args.id && args.id.toString() !== currentUser._id.toString();
      const canAssignCountryToOtherUsers =
        isEditingAnotherUser &&
        currentUser.roles?.some((role) =>
          role.permissions?.some((permission) => {
            return permission.type === permissions.canSeeUsers;
          })
        );

      // Create base update
      const update = {
        attributes: {},
      };
      Object.assign(
        update,
        args.profile.favoriteApp && { favoriteApp: args.profile.favoriteApp },
        args.profile.name && { name: args.profile.name },
        args.profile.firstName && { firstName: args.profile.firstName },
        args.profile.lastName && { lastName: args.profile.lastName }
      );

      // Create attribute update
      const attributes = {};
      if (args.profile.attributes) {
        for (const attribute in args.profile.attributes) {
          if (
            attribute === COUNTRY_ATTRIBUTE &&
            !canAssignCountryToOtherUsers
          ) {
            continue;
          }
          const targetAttribute = availableAttributes.find(
            (x) => x.value === attribute
          );
          if (targetAttribute && targetAttribute.userCanEdit) {
            Object.assign(attributes, {
              [attribute]: get(args.profile.attributes, attribute, null),
            });
          }
        }
      }

      if (!isEmpty(attributes)) {
        Object.assign(update, { attributes });
      }

      if (args.id) {
        if (ability.can('update', 'User')) {
          try {
            const user = await User.findById(args.id).select('attributes');
            update.attributes = { ...user.attributes, ...attributes };
            return await User.findByIdAndUpdate(args.id, update, { new: true });
          } catch {
            throw new GraphQLError(
              context.i18next.t('common.errors.dataNotFound')
            );
          }
        } else {
          throw new GraphQLError(
            context.i18next.t('common.errors.permissionNotGranted')
          );
        }
      } else {
        const user = await User.findById(currentUser._id).select('attributes');
        update.attributes = { ...user.attributes, ...attributes };
        return await User.findByIdAndUpdate(currentUser._id, update, {
          new: true,
        });
      }
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
