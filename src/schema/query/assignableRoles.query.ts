import { GraphQLList, GraphQLID, GraphQLError } from 'graphql';
import { Role } from '@models';
import { RoleType } from '../types';
import { logger } from '@lib/logger';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import permissions from '@const/permissions';

/** Arguments for the assignableRoles query */
type AssignableRolesArgs = {
  application?: string | Types.ObjectId;
};

/**
 * List roles that the logged user can assign to other users.
 * Uses can_add_users.{roleId} granular permissions to filter.
 * If the user has can_see_users for the application, returns all app roles.
 * Throw GraphQL error if not logged or not authorized.
 */
export default {
  type: new GraphQLList(RoleType),
  args: {
    application: { type: GraphQLID },
  },
  async resolve(parent, args: AssignableRolesArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const user = context.user;

      // Get all roles for the application (or global roles if no app specified)
      const filter: Record<string, any> = args.application
        ? { application: args.application }
        : { application: null };
      const allRoles = await Role.find(filter);

      if (!allRoles.length) {
        return [];
      }

      // Check if user has global canSeeUsers permission
      const hasGlobalSeeUsers = user.roles
        .flatMap((r) => r.permissions)
        .some((p) => p.type === permissions.canSeeUsers && p.global);

      if (hasGlobalSeeUsers) {
        return allRoles;
      }

      // Check if user has canSeeUsers for this specific application
      if (args.application) {
        const hasAppSeeUsers = user.roles
          .filter((r) =>
            r.application
              ? new Types.ObjectId(r.application).equals(args.application)
              : false
          )
          .flatMap((r) => r.permissions)
          .some((p) => p.type === permissions.canSeeUsers);

        if (hasAppSeeUsers) {
          return allRoles;
        }
      }

      // Get the user's can_add_users.{roleId} permissions
      const addUserPermissions = user.roles
        .filter((r) =>
          args.application
            ? r.application
              ? new Types.ObjectId(r.application).equals(args.application)
              : false
            : true
        )
        .flatMap((r) => r.permissions)
        .filter((p) => p.type?.startsWith(`${permissions.canAddUsers}.`))
        .map((p) => (p.type || '').replace(`${permissions.canAddUsers}.`, ''));

      if (!addUserPermissions.length) {
        return [];
      }

      // Return only roles the user can assign
      return allRoles.filter((role) =>
        addUserPermissions.includes(role._id.toString())
      );
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
