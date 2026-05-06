import { GraphQLList, GraphQLBoolean, GraphQLID, GraphQLError } from 'graphql';
import { Permission, Role } from '@models';
import { RoleType } from '../types';
import { AppAbility } from '@security/defineUserAbility';
import { logger } from '@lib/logger';
import { accessibleBy } from '@casl/mongoose';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import permissions from '@const/permissions';

/** Arguments for the roles query */
type RolesArgs = {
  all?: boolean;
  application?: string | Types.ObjectId;
  forUserAssignment?: boolean;
  asRole?: string | Types.ObjectId;
};

/** Prefix used by user-assignment permissions. */
const canAddUsersPrefix = `${permissions.canAddUsers}.`;

/** Visibility details for role assignment lists. */
type AssignmentVisibility = {
  hasApplicationUserPermission: boolean;
  hasUnrestrictedRoleVisibility: boolean;
  limitedRoleIds: string[];
};

/**
 * Returns visibility rules for role assignment in an application.
 *
 * @param rolePermissionTypes Permission list to evaluate
 * @returns Assignment visibility details
 */
const getAssignmentVisibility = (
  rolePermissionTypes: string[]
): AssignmentVisibility => {
  const limitedRoleIds = new Set<string>();
  let hasApplicationUserPermission = false;
  let hasUnrestrictedRoleVisibility = false;

  if (rolePermissionTypes.includes(permissions.canSeeUsers)) {
    hasApplicationUserPermission = true;
    const roleLimitedRoleIds = rolePermissionTypes
      .filter((type) => type.startsWith(canAddUsersPrefix))
      .map((type) => type.slice(canAddUsersPrefix.length))
      .filter((id) => !!id);

    if (roleLimitedRoleIds.length === 0) {
      hasUnrestrictedRoleVisibility = true;
    } else {
      roleLimitedRoleIds.forEach((id) => limitedRoleIds.add(id));
    }
  }

  return {
    hasApplicationUserPermission,
    hasUnrestrictedRoleVisibility,
    limitedRoleIds: [...limitedRoleIds],
  };
};

/**
 * Reads permission types from a role permissions array.
 *
 * @param permissionsList Role permissions array
 * @returns List of permission types
 */
const getPermissionTypesFromRolePermissions = async (
  permissionsList: any[]
): Promise<string[]> => {
  const populatedTypes = (permissionsList || [])
    .map((permission) => permission?.type)
    .filter((type): type is string => typeof type === 'string');

  if (populatedTypes.length > 0) {
    return [...new Set(populatedTypes)];
  }

  const permissionIds = (permissionsList || [])
    .map((permission) => {
      if (permission instanceof Types.ObjectId) {
        return permission;
      }
      if (
        typeof permission === 'string' &&
        Types.ObjectId.isValid(permission)
      ) {
        return new Types.ObjectId(permission);
      }
      if (permission?._id && Types.ObjectId.isValid(permission._id)) {
        return new Types.ObjectId(permission._id);
      }
      if (permission?.id && Types.ObjectId.isValid(permission.id)) {
        return new Types.ObjectId(permission.id);
      }
      if (
        permission &&
        typeof permission.toString === 'function' &&
        Types.ObjectId.isValid(permission.toString())
      ) {
        return new Types.ObjectId(permission.toString());
      }
      return null;
    })
    .filter((id): id is Types.ObjectId => !!id);

  if (permissionIds.length === 0) {
    return [];
  }

  const permissionDocs = await Permission.find({ _id: { $in: permissionIds } })
    .select('type')
    .lean();
  return permissionDocs
    .map((permission) => permission.type)
    .filter((type): type is string => typeof type === 'string');
};

/**
 * Computes role assignment visibility from authenticated user app roles.
 *
 * @param context GraphQL request context
 * @param application Application id
 * @returns Assignment visibility details
 */
const getAssignmentVisibilityFromUser = async (
  context: Context,
  application: string | Types.ObjectId
): Promise<AssignmentVisibility> => {
  const applicationId = application.toString();
  const mergedPermissionTypes = new Set<string>();

  for (const role of context.user.roles || []) {
    const roleApplicationId =
      role.application instanceof Types.ObjectId
        ? role.application.toString()
        : role.application?._id?.toString?.() ||
          role.application?.id?.toString?.() ||
          role.application?.toString?.();
    if (!roleApplicationId || roleApplicationId !== applicationId) {
      continue;
    }

    const permissionTypes = await getPermissionTypesFromRolePermissions(
      role.permissions || []
    );
    permissionTypes.forEach((type) => mergedPermissionTypes.add(type));
  }

  return getAssignmentVisibility([...mergedPermissionTypes]);
};

/**
 * Computes role assignment visibility from a preview role.
 *
 * @param application Application id
 * @param roleId Preview role id
 * @returns Assignment visibility details
 */
const getAssignmentVisibilityFromRole = async (
  application: string | Types.ObjectId,
  roleId: string | Types.ObjectId
): Promise<AssignmentVisibility> => {
  const applicationId = application.toString();
  const role = await Role.findOne({
    _id: roleId,
    application: new Types.ObjectId(applicationId),
  });
  if (!role) {
    return {
      hasApplicationUserPermission: false,
      hasUnrestrictedRoleVisibility: false,
      limitedRoleIds: [],
    };
  }

  const permissionTypes = await getPermissionTypesFromRolePermissions(
    role.permissions || []
  );

  return getAssignmentVisibility(permissionTypes);
};

/**
 * List roles if logged user has admin permission.
 * Throw GraphQL error if not logged or not authorized.
 */
export default {
  type: new GraphQLList(RoleType),
  args: {
    all: { type: GraphQLBoolean },
    application: { type: GraphQLID },
    forUserAssignment: { type: GraphQLBoolean },
    asRole: { type: GraphQLID },
  },
  async resolve(parent, args: RolesArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const ability: AppAbility = context.user.ability;
      if (args.forUserAssignment) {
        if (!args.application) {
          throw new GraphQLError(
            context.i18next.t('common.errors.permissionNotGranted')
          );
        }

        let assignmentVisibility: AssignmentVisibility;
        // Preview path: evaluate visibility as the selected role.
        if (args.asRole) {
          assignmentVisibility = await getAssignmentVisibilityFromRole(
            args.application,
            args.asRole
          );
        } else if (ability.can('update', 'User')) {
          // Global user-management permission keeps full list.
          assignmentVisibility = {
            hasApplicationUserPermission: true,
            hasUnrestrictedRoleVisibility: true,
            limitedRoleIds: [],
          };
        } else {
          assignmentVisibility = await getAssignmentVisibilityFromUser(
            context,
            args.application
          );
        }

        if (!assignmentVisibility.hasApplicationUserPermission) {
          throw new GraphQLError(
            context.i18next.t('common.errors.permissionNotGranted')
          );
        }

        const roleFilter: Record<string, unknown> = {
          application: args.application,
        };
        if (!assignmentVisibility.hasUnrestrictedRoleVisibility) {
          const validRoleIds = assignmentVisibility.limitedRoleIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id));
          roleFilter._id = { $in: validRoleIds };
        }
        return await Role.find(roleFilter);
      }

      if (ability.can('read', 'Role')) {
        if (args.all) {
          const roles = await Role.find(accessibleBy(ability, 'read').Role);
          return roles;
        } else {
          if (args.application) {
            const roles = await Role.find({
              application: args.application,
              ...accessibleBy(ability, 'read').Role,
            });
            return roles;
          } else {
            const roles = await Role.find({
              application: null,
              ...accessibleBy(ability, 'read').Role,
            });
            return roles;
          }
        }
      } else {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
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
