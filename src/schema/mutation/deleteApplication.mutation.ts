import { GraphQLNonNull, GraphQLID, GraphQLError } from 'graphql';
import { ApplicationType } from '../types';
import { Application, Channel, Notification } from '@models';
import channels from '@const/channels';
import { AppAbility } from '@security/defineUserAbility';
import { logger } from '@lib/logger';
import { accessibleBy } from '@casl/mongoose';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import { PubSub } from 'graphql-subscriptions';

/** Arguments for the deleteApplication mutation */
type DeleteApplicationArgs = {
  id: string | Types.ObjectId;
};

/**
 * Deletes an application from its id.
 * Recursively delete associated pages and dashboards/workflows.
 * Throw GraphQLError if not authorized.
 *
 * @param pubsub PubSub
 * @returns GraphQL Mutation
 */
const deleteApplication = (pubsub: PubSub) => ({
  type: ApplicationType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
  },
  async resolve(parent, args: DeleteApplicationArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      // Delete the application
      const ability: AppAbility = context.user.ability;
      if (!ability.can('delete', 'Application')) {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
      }

      const filters = Application.find(
        accessibleBy(ability, 'delete').Application
      )
        .where({ _id: args.id })
        .getFilter();
      const application = await Application.findOneAndDelete(filters);
      if (!application)
        throw new GraphQLError('common.errors.permissionNotGranted');
      // Send notification
      const channel = await Channel.findOne({ title: channels.applications });
      const notification = new Notification({
        action: 'Application deleted',
        content: application,
        //createdAt: new Date(),
        channel: channel.id,
        seenBy: [],
      });
      await notification.save();
      pubsub.publish(channel.id, { notification });
      return application;
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
});

export default deleteApplication;
