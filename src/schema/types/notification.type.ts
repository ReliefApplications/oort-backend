import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLID,
  GraphQLBoolean,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { Channel } from '@models';
import { ChannelType } from './channel.type';
import { UserType } from './user.type';
import { Connection } from './pagination.type';

/** GraphQL notification type definition */
export const NotificationType = new GraphQLObjectType({
  name: 'Notification',
  fields: () => ({
    id: {
      type: GraphQLID,
      resolve(parent) {
        return parent._id;
      },
    },
    action: { type: GraphQLString },
    content: { type: GraphQLJSON },
    createdAt: { type: GraphQLString },
    channel: {
      type: ChannelType,
      async resolve(parent) {
        const channel = await Channel.findById(parent.channel);
        return channel;
      },
    },
    read: {
      type: GraphQLBoolean,
      async resolve(parent, args, context) {
        return parent.seenBy.includes(context?.user._id.toString());
      },
    },
    user: { type: UserType },
    redirect: { type: GraphQLJSON },
  }),
});

/** GraphQL notification connection type definition */
export const NotificationConnectionType = Connection(NotificationType);
