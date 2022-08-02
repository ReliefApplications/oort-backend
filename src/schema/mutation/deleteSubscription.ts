import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLError,
  GraphQLString,
} from 'graphql';
import { Application } from '../../models';
import { ApplicationType } from '../types';
import { AppAbility } from '../../security/defineUserAbilities';
import { deleteQueue } from '../../server/subscriberSafe';

export default {
  /*  Deletes a subscription.
        Throws an error if not logged or authorized.
    */
  type: ApplicationType,
  args: {
    applicationId: { type: new GraphQLNonNull(GraphQLID) },
    routingKey: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    if (!user) {
      throw new GraphQLError(context.i18next.t('errors.userNotLogged'));
    }

    const ability: AppAbility = context.user.ability;
    const filters = Application.accessibleBy(ability, 'update')
      .where({ _id: args.applicationId })
      .getFilter();
    const application = await Application.findOne(filters);
    if (!application)
      throw new GraphQLError(context.i18next.t('errors.dataNotFound'));
    application.subscriptions = await application.subscriptions.filter(
      (sub) => sub.routingKey !== args.routingKey
    );
    await Application.findByIdAndUpdate(args.applicationId, application, {
      new: true,
    });
    deleteQueue(args.routingKey);
    return application;
  },
};
