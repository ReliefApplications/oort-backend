import { Application, Record, Resource } from '@models';
import config from 'config';
import { isEmpty, isEqual } from 'lodash';
import { buildNotificationFilter } from '@server/components/notification/notification-filter';
import { handleNotification } from '@server/components/notification/notification-handler';
import logger from '@lib/logger';
import sift from 'sift';
import { PubSub } from 'graphql-subscriptions';

/**
 * Sets up record watching for custom notifications
 *
 * @param pubsub PubSub
 */
export function setupRecordWatcher(pubsub: PubSub): void {
  if (!(config.get('notifications.leader') == 'true')) {
    return;
  }
  // Watch records creation and updates to see if should emit trigger notification
  Record.watch([], {
    fullDocument: 'updateLookup',
    fullDocumentBeforeChange: 'whenAvailable',
  }).on('change', async (data) => {
    try {
      const recordId = data.documentKey._id;
      const record = await Record.findById(recordId);

      const type =
        data.operationType === 'update' ? 'onRecordUpdate' : 'onRecordCreation';
      // Get all applications with custom notifications for the record resource
      const applications = await Application.find({
        customNotifications: {
          $exists: true,
          $type: 'array',
          $ne: [],
          $elemMatch: {
            applicationTrigger: true,
            status: 'active',
            resource: record.resource,
            ...(type === 'onRecordUpdate' && { onRecordUpdate: true }),
            ...(type === 'onRecordCreation' && { onRecordCreation: true }),
          },
        },
      }).populate({
        path: 'customNotifications',
        model: 'CustomNotification',
      });

      if (applications) {
        // Get record resource details
        const resource = await Resource.findById(record.resource);
        // Get the triggers and filters of each application, to check if exists and if should send trigger notification/email
        for (const application of applications) {
          const triggers = application.customNotifications.filter(
            (trigger) =>
              trigger.applicationTrigger &&
              trigger[type] &&
              isEqual(trigger.resource, record.resource)
          );
          for (const trigger of triggers) {
            // For each triggers, get trigger filter
            const mongooseFilter = buildNotificationFilter(trigger, resource);
            // And see if record that triggered watch() should emit notification
            const recordFiltered = await Record.find({
              $and: [mongooseFilter, { _id: recordId }],
            });
            if (recordFiltered.length) {
              if (type === 'onRecordUpdate' && !isEmpty(mongooseFilter)) {
                // If record is updated, check if pre-image matches filter
                // Only applies if filter is not empty
                if (
                  sift({
                    $and: [mongooseFilter, { _id: recordId }],
                  })(data.fullDocumentBeforeChange)
                ) {
                  // Previous version was already matching the filter, skip
                  // This enables updates to only trigger when changes re done on conditions matching the filter
                  continue;
                }
              }
              handleNotification(
                pubsub,
                trigger,
                application,
                resource,
                recordFiltered
              );
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Fail to send notification: ${err.message}`);
    }
  });
}
