import { GraphQLList, GraphQLError, GraphQLID } from 'graphql';
import { Application, Permission } from '@models';
import { PermissionType } from '../types';
import { logger } from '@lib/logger';
import { graphQLAuthCheck } from '@schema/shared';
import { Context } from '@server/apollo/context';

/** Arguments for the permissions query */
type PermissionsArgs = {
  application?: boolean;
};

/**
 * List permissions.
 * Throw GraphQL error if not logged.
 */
export default {
  type: new GraphQLList(PermissionType),
  args: {
    application: { type: GraphQLID },
  },
  async resolve(parent, args: PermissionsArgs, context: Context) {
    // Check that user is authenticated
    graphQLAuthCheck(context);
    try {
      if (args.application) {
        const application = await Application.findById(args.application, 'id');
        if (!application) {
          throw new GraphQLError(
            context.i18next.t('common.errors.dataNotFound')
          );
        }

        // Query application scoped permissions
        const appPermissions = await Permission.find({
          global: false,
          $or: [
            { application: { $exists: false } },
            { application: null },
            { application: args.application },
          ],
        });
        return appPermissions;
      }
      // Query admin permissions
      const backOfficePermissions = await Permission.find({ global: true });
      return backOfficePermissions;
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
