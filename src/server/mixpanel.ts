import * as Mixpanel from 'mixpanel-browser';
import config from 'config';
import { Form, Record } from '@models';
import { UserWithAbility } from './apollo/context';

let initialized = false;

/**
 * Init mixpanel connection to store logs
 */
export const initMixpanel = async () => {
  if (config.get('mixpanel.token')) {
    initialized = true;
    Mixpanel.init(config.get('mixpanel.token'), {
      debug: true,
      track_pageview: true,
      persistence: 'localStorage',
    });
  }
};

/**
 * Register creation/update of records events.
 *
 * @param type type of record event. It can be 'Add record' or 'Edit record'
 * @param form form of the record
 * @param record record of the event
 * @param user user responsible for the action
 * @param details extra details about the event to be register
 */
export const recordEvent = async (
  type: 'Add record' | 'Edit record',
  form: Form | string,
  record: Record | string,
  user: UserWithAbility,
  details?: string
) => {
  console.log('initMixpanel');
  if (initialized) {
    Mixpanel.track(type, {
      $user: user,
      $form: form,
      $record: record,
      ...(details && { $details: details }),
    });
  }
};
