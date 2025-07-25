import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLList,
  GraphQLString,
  GraphQLError,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { get, has } from 'lodash';
import { Permission, Role } from '@models';
import { AppAbility } from '@security/defineUserAbility';
import { RoleType } from '../types';
import { logger } from '@lib/logger';
import { accessibleBy } from '@casl/mongoose';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import permissions from '@const/permissions';

/** Arguments for the editRole mutation */
type EditRoleArgs = {
  id: string | Types.ObjectId;
  permissions?: string[] | Types.ObjectId[];
  channels?: string[] | Types.ObjectId[];
  title?: string;
  description?: string;
  autoAssignment?: any;
};

/**
 * Check if permissions exist for target role
 *
 * @param roleId Role id
 * @param applicationId Application id
 */
const checkPermissions = async (
  roleId: Types.ObjectId,
  applicationId?: string | Types.ObjectId
) => {
  try {
    // Define the permission type that should exist for this role
    const permissionType = `${permissions.canAddUsers}.${roleId.toString()}`;

    // Check if the permission already exists
    const existingPermission = await Permission.findOne({
      type: permissionType,
      global: false,
      ...(applicationId && { application: applicationId }),
    });

    // If it doesn't exist, create it
    if (!existingPermission) {
      await Permission.create({
        type: permissionType,
        global: false,
        ...(applicationId && { application: applicationId }),
      });
    }
  } catch (error) {
    logger.error(
      `Failed to check/create permissions for role ${roleId}:`,
      error
    );
    throw error;
  }
};

/**
 * Edit a role's admin permissions, providing its id and the list of admin permissions.
 * Throw an error if not logged or authorized.
 */
export default {
  type: RoleType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    permissions: { type: new GraphQLList(GraphQLID) },
    channels: { type: new GraphQLList(GraphQLID) },
    title: { type: GraphQLString },
    description: { type: GraphQLString },
    autoAssignment: {
      type: GraphQLJSON,
    },
  },
  async resolve(parent, args: EditRoleArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const autoAssignmentUpdate: any = {};
      if (args.autoAssignment) {
        if (has(args.autoAssignment, 'add')) {
          Object.assign(autoAssignmentUpdate, {
            $addToSet: {
              autoAssignment: get(args.autoAssignment, 'add'),
            },
          });
        }
        if (has(args.autoAssignment, 'remove')) {
          Object.assign(autoAssignmentUpdate, {
            $pull: {
              autoAssignment: get(args.autoAssignment, 'remove'),
            },
          });
        }
      }

      const ability: AppAbility = context.user.ability;
      const update = {};
      Object.assign(
        update,
        args.permissions && { permissions: args.permissions },
        args.channels && { channels: args.channels },
        args.title && { title: args.title },
        args.description && { description: args.description },
        autoAssignmentUpdate.$pull && { $pull: autoAssignmentUpdate.$pull }
      );

      const filters = Role.find(accessibleBy(ability, 'update').Role)
        .where({ _id: args.id })
        .getFilter();

      // doing a separate update to avoid the following error:
      // Updating the path 'x' would create a conflict at 'x'
      if (autoAssignmentUpdate.$addToSet) {
        await Role.findOneAndUpdate(filters, {
          $addToSet: autoAssignmentUpdate.$addToSet,
        });
      }

      await Role.findOneAndUpdate(filters, update, { new: true });
      const role = await Role.findOneAndUpdate(
        filters,
        { $pull: { autoAssignment: null } },
        { new: true }
      );
      if (!role) {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
      }

      // Last check
      await checkPermissions(role._id, role.application);
      return role;
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
