import { NotificationType } from "../types";

export default {
    type: NotificationType,
    subscribe: (parent, args, context) => {
        // Subscribe to channels available in user's roles
        return context.pubsub.asyncIterator(context.user.roles.map(role => role.channels.map(x => String(x._id))).flat());
    }
}