import {
  customNotificationRecipientsType,
  customNotificationType,
} from '@const/enumTypes';
import {
  CustomNotification,
  Resource,
  Record,
  Application,
  User,
} from '@models';
import { get } from 'lodash';
import { sendNotification } from './notification-sender';
import { logger } from '@lib/logger';
import { preprocess } from '@utils/email';
import mongoose from 'mongoose';

/**
 * Depending on  notification type,  for custom notification
 *
 * @param content template content
 * @param notificationType notification type
 * @param fields fields to process
 * @param rows data of records rows
 * @param user optional user object
 * @param user.firstName User first name
 * @param user.lastName User last name
 * @param user.email User email
 */
const preprocessNotificationTemplate = async (
  content,
  notificationType,
  fields,
  rows,
  user?: {
    firstName?: string;
    lastName?: string;
    email: string;
  }
) => {
  if (notificationType === customNotificationType.email) {
    content.body = preprocess(
      content.body,
      {
        fields,
        rows,
      },
      user
    );
    content.subject = preprocess(
      content.subject,
      {
        fields,
        rows,
      },
      user
    );
  } else {
    content.title = preprocess(
      content.title,
      {
        fields,
        rows,
      },
      user
    );
    content.description = preprocess(
      content.description,
      {
        fields,
        rows,
      },
      user
    );
  }
  return content;
};

/**
 * Resolves email recipients to User objects when possible, falls back to email strings
 *
 * @param emails array of email addresses
 * @returns object containing resolved users and email-only recipients
 */
const resolveRecipientsFromEmails = async (emails: string[]) => {
  // Find users where username matches any of the provided emails
  const foundUsers = await User.find(
    {
      username: { $in: emails },
    },
    'username id firstName lastName'
  );

  // Create a map of email -> user for quick lookup
  const userMap = new Map();
  foundUsers.forEach((user) => {
    userMap.set(user.username, user);
  });

  // Separate users from email-only recipients
  const resolvedUsers = [];
  const emailOnlyRecipients: string[] = [];

  emails.forEach((email) => {
    const user = userMap.get(email);
    if (user) {
      resolvedUsers.push({
        id: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.username,
      });
    } else {
      emailOnlyRecipients.push(email);
    }
  });

  return {
    users: resolvedUsers,
    emails: emailOnlyRecipients,
    allRecipients: [
      ...resolvedUsers.map((u) => u.username),
      ...emailOnlyRecipients,
    ],
  };
};

/**
 * Check if trigger has filters, if so return mongoose filter
 *
 * @param notification custom notification
 * @param application custom notification's application
 * @param resource resource object
 * @param records records object
 */
export const handleNotification = async (
  notification: CustomNotification,
  application: Application,
  resource?: Resource,
  records?: Record[]
) => {
  try {
    // Get template from notification
    const template = application.templates.find(
      (x) => x._id.toString() === notification.template.toString()
    );

    const notificationType = get(notification, 'notificationType', 'email');

    let success = false;
    let recipients: string[] = [];
    let userField = '';
    let emailField = '';

    // Based on recipients type, set list of recipients
    switch (notification.recipientsType) {
      // Use single email as recipients
      case customNotificationRecipientsType.email: {
        recipients = [notification.recipients];
        break;
      }
      // Use distribution list as recipients
      case customNotificationRecipientsType.distributionList: {
        const distribution = application.distributionLists.find(
          (x) => x._id.toString() === notification.recipients
        );
        recipients = get(distribution, 'emails', []);
        break;
      }
      // Use dataset user question field as recipients
      case customNotificationRecipientsType.userField: {
        userField = notification.recipients;
        break;
      }
      // Use dataset email question field as recipients
      case customNotificationRecipientsType.emailField: {
        emailField = notification.recipients;
        break;
      }
      // Use channel as recipients
      case customNotificationRecipientsType.channel: {
        recipients = [notification.recipients];
        break;
      }
    }

    if (resource) {
      // Find associated layout
      const layout = resource.layouts.find(
        (x) => x._id.toString() === notification.layout.toString()
      );

      // Build list of fields, associated with layout
      const fields = [];
      for (const field of resource.fields) {
        const layoutField = layout.query.fields.find(
          (f) => f.name == field.name
        );
        if (field.type != 'users') {
          fields.push({
            name: field.name,
            field: field.name,
            type: field.type,
            meta: {
              field: field,
            },
            title: layoutField?.label || layoutField?.name,
          });
        }
      }

      if (records.length) {
        const redirectToRecords =
          notification.redirect && notification.redirect.active;
        const recordsIds = [];
        const recordListArr = [];
        for (const record of records) {
          if (record.data) {
            Object.keys(record.data).forEach(function (key) {
              const value = record.data[key];
              if (Array.isArray(value)) {
                record.data[key] = value.join(',');
              } else if (value instanceof Date) {
                record.data[key] = value.toISOString();
              } else {
                record.data[key] = value;
              }
            });
            recordListArr.push({ ...record.data, id: record._id });
            if (redirectToRecords) {
              recordsIds.push(record._id);
            }
          }
        }

        // Extract recipients from field values of records
        if (!!userField || !!emailField) {
          const field = userField || emailField;
          const groupRecordArr = [];
          const groupValArr = [];
          for (const record of recordListArr) {
            const index = groupValArr.indexOf(record[field]);
            if (index == -1) {
              groupValArr.push(record[field].split(','));
              delete record[field];
              groupRecordArr.push([record]);
            } else {
              delete record[field];
              groupRecordArr[index].push(record);
            }
          }

          let d = 0;
          for await (const groupRecord of groupRecordArr) {
            if (groupRecord.length > 0) {
              template.content = await preprocessNotificationTemplate(
                template.content,
                notificationType,
                fields,
                groupRecord
              );
            }
            if (!!userField) {
              // If using userField, get the user with the id saved in the record data
              const userDetails = await User.find(
                {
                  _id: {
                    $in: groupValArr[d].map(
                      (id: string) => new mongoose.Types.ObjectId(id)
                    ),
                  },
                },
                'username id'
              );
              if (userDetails.length > 0) {
                if (notificationType === customNotificationType.email) {
                  // If email type, should get user email
                  recipients = userDetails.map((details) => details.username);
                  await sendNotification(template, recipients, notification);
                  success = true;
                } else {
                  // If notification type, should get user id
                  recipients = userDetails.map((details) => details.id);
                  await sendNotification(
                    template,
                    recipients,
                    notification,
                    recordsIds
                  );
                  success = true;
                }
              }
            } else {
              // If using emailField, get the email saved in the record data
              recipients = groupValArr[d];
              await sendNotification(template, recipients, notification);
              success = true;
            }
            d++;
          }
        } else {
          const { users, emails } = await resolveRecipientsFromEmails(
            recipients
          );
          // Send one notification per user
          for (const user of users) {
            template.content = await preprocessNotificationTemplate(
              template.content,
              notificationType,
              fields,
              recordListArr,
              user
            );
            await sendNotification(
              template,
              [user.email],
              notification,
              recordsIds
            );
          }
          // Send one notification per email (not associated with a user)
          for (const email of emails) {
            template.content = await preprocessNotificationTemplate(
              template.content,
              notificationType,
              fields,
              recordListArr,
              {
                email,
              }
            );
            await sendNotification(template, [email], notification, recordsIds);
          }

          success = true;
        }
      }
    } else {
      await sendNotification(template, recipients, notification);
      success = true;
    }

    // On success, update last execution status
    if (success) {
      const update = {
        $set: {
          'customNotifications.$.lastExecutionStatus': 'success',
          'customNotifications.$.lastExecution': new Date(),
        },
      };
      await Application.findOneAndUpdate(
        {
          _id: application._id,
          'customNotifications._id': notification._id,
        },
        update
      );
    }
  } catch (error) {
    logger.error(error.message, { stack: error.stack });
  }
};
