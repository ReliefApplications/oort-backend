import {
  CompositeFilterDescriptor,
  FilterDescriptor,
} from '@const/compositeFilter';
import { CustomNotification, Resource, User } from '@models';
import getFilter from '@utils/schema/resolvers/Query/getFilter';
import { get } from 'lodash';

/**
 * Filter channel according to user attributes and data
 *
 * @param user Current user
 * @param filter Notification filter
 * @param data Notification data
 * @returns True if user pass the filter
 */
export const filterChannel = (
  user: User,
  filter: CompositeFilterDescriptor | FilterDescriptor,
  data: any
) => {
  if (!filter) return true;
  if ('filters' in filter) {
    switch (filter.logic) {
      case 'and': {
        return filter.filters.every((f) => filterChannel(user, f, data));
      }
      case 'or': {
        return filter.filters.some((f) => filterChannel(user, f, data));
      }
      default: {
        return false;
      }
    }
  } else {
    const fieldName = filter.field.split('.')[1];
    const valueNameMatch = filter.value.match(/{{data\.(.*?)}}/);
    const valueName = valueNameMatch ? valueNameMatch[1] : null;
    switch (filter.operator) {
      case 'eq': {
        return get(user, `attributes.${fieldName}`) === get(data, valueName);
      }
      case 'neq': {
        return get(user, `attributes.${fieldName}`) !== get(data, valueName);
      }
    }
  }
};

/**
 * Check if trigger has filters, if so return mongoose filter
 *
 * @param notification custom notification
 * @param resource resource object
 * @returns mongoose filter or empty object
 */
export const buildNotificationFilter = (
  notification: CustomNotification,
  resource: Resource
) => {
  let mongooseFilter = {};
  // If triggers check if has filters
  if (notification.applicationTrigger && notification.filter?.filters?.length) {
    // TODO: take into account resources questions
    // Filter from the query definition
    mongooseFilter = getFilter(notification.filter, resource.fields, {
      resourceFieldsById: {
        [resource._id.toString()]: resource.fields,
      },
    });
  }
  return mongooseFilter;
};
