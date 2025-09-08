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
  Role,
} from '@models';
import { get } from 'lodash';
import { sendNotification } from './notification-sender';
import { logger } from '@lib/logger';
import { preprocess } from '@utils/email';
import axios from 'axios';
import qs from 'qs';
import Exporter from '@utils/files/resourceExporter';
import { restMiddleware } from '@server/middlewares';
import config from 'config';
import { PubSub } from 'graphql-subscriptions';
import mongoose from 'mongoose';

/**
 * Flattens a nested array
 *
 * @param arr The array to flatten
 * @returns A new flattened array
 */
const flatDeep = (arr: any[]): any[] => {
  return arr.reduce(
    (acc, val) => acc.concat(Array.isArray(val) ? flatDeep(val) : val),
    []
  );
};

/**
 * Prettifies a label by replacing underscores and camel case
 *
 * @param label The label to prettify
 * @returns The prettified label
 */
const prettifyLabel = (label: string): string => {
  label = label.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return label;
};

/**
 * Gets the fields from a given array of field definitions
 *
 * @param fields The array of field definitions
 * @param prefix An optional prefix for the field names
 * @returns An array of processed field definitions
 */
const getFields = (fields: any[], prefix?: string): any[] => {
  return flatDeep(
    fields.map((f) => {
      const fullName: string = prefix ? `${prefix}.${f.name}` : f.name;
      switch (f.kind) {
        case 'OBJECT': {
          return getFields(f.fields, fullName);
        }
        case 'LIST': {
          const title = f.label ? f.label : prettifyLabel(f.name);
          const subFields = getFields(f.fields, fullName);
          return {
            name: fullName,
            title,
            subFields,
            width: f.width,
          };
        }
        default: {
          const title = f.label ? f.label : prettifyLabel(f.name);
          return {
            name: fullName,
            title,
            width: f.width,
          };
        }
      }
    })
  );
};

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
 * @returns processed content
 */
const preprocessNotificationTemplate = (
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
 * Resolves user objects from an array of user IDs
 *
 * @param ids Array of user IDs
 * @returns Array of user objects
 */
const resolveRecipientsFromIds = async (ids: string[]) => {
  const foundUsers: any[] = await User.find(
    {
      _id: { $in: ids },
    },
    'username id firstName lastName'
  );

  return foundUsers.map((user) => ({
    id: user.id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.username,
  }));
};

/**
 * Resolves recipients from channel IDs
 *
 * @param channelIds Array of channel IDs
 * @returns Array of user objects
 */
const resolveRecipientsFromChannels = async (channelIds: string[]) => {
  const objChannelIds = channelIds.map((id) => new mongoose.Types.ObjectId(id));
  const roles = await Role.find({ channels: { $in: objChannelIds } })
    .select('_id')
    .lean();
  if (!roles.length) return [];
  const roleIds = roles.map((r) => r._id);
  const foundUsers = await User.find(
    { roles: { $in: roleIds } },
    'username id firstName lastName'
  );

  return foundUsers.map((user) => ({
    id: user.id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.username,
  }));
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
 * Fetches a client token from the authentication server
 * Enables the handler to call the server itself to build the fields from the metadata query
 *
 * @returns The client token
 */
const getClientToken = async () => {
  const tokenUrl = `https://id-mab.unesco.oortcloud.tech/realms/${config.get(
    'auth.realm'
  )}/protocol/openid-connect/token`;

  const data = qs.stringify({
    grant_type: 'client_credentials',
    client_id: config.get('notifications.clientId'),
    client_secret: config.get('notifications.clientSecret'),
  });

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const accessToken = response.data.access_token;
    return accessToken;
  } catch (err) {
    console.error('Error fetching token:', err.response?.data || err.message);
    throw err;
  }
};

/**
 * Check if trigger has filters, if so return mongoose filter
 *
 * @param pubsub PubSub
 * @param notification custom notification
 * @param application custom notification's application
 * @param resource resource object
 * @param records records object
 */
export const handleNotification = async (
  pubsub: PubSub,
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

      const token = await getClientToken();
      const request = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };
      const mockRes = {
        status: () => mockRes,
        json: () => mockRes,
        send: () => mockRes,
        // Add other required response methods
      };

      // Attach context to request based on token
      const authenticateUser = () => {
        return new Promise<void>((resolve, reject) => {
          restMiddleware(request, mockRes, (err) => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        });
      };

      await authenticateUser();

      const exporter = new Exporter(request, null, resource, {
        query: layout.query,
        format: 'csv',
        fileName: 'test',
        timeZone: 'Europe/Paris',
        fields: getFields(layout.query.fields),
        filter: {
          logic: 'and',
          filters: [
            {
              value: records.map((r) => r._id.toString()),
              operator: 'eq',
              field: 'ids',
            },
          ],
        },
      });
      await exporter.getColumns();
      const newRecords = await exporter.getRecords();

      if (newRecords.length) {
        const redirectToRecords =
          notification.redirect && notification.redirect.active;

        // Extract recipients from field values of records
        if (!!userField || !!emailField) {
          const recipientField = userField || emailField;
          const recordGroups = [];
          const recordGroupKeys = [];
          for (const record of newRecords) {
            const index = recordGroupKeys.indexOf(get(record, recipientField));
            if (index == -1) {
              recordGroupKeys.push(get(record, recipientField));
              recordGroups.push([record]);
            } else {
              recordGroups[index].push(record);
            }
          }

          let d = 0;
          for await (const group of recordGroups) {
            const recordsIds = [];
            for (const record of group) {
              if (redirectToRecords) {
                recordsIds.push(record._id);
              }
            }
            if (!!userField) {
              const users = await resolveRecipientsFromIds(recordGroupKeys[d]);
              if (users.length > 0) {
                // Send one notification per user
                for (const user of users) {
                  await sendNotification(
                    pubsub,
                    preprocessNotificationTemplate(
                      template.content,
                      notificationType,
                      exporter.columns,
                      group,
                      user
                    ),
                    [user.email],
                    notification,
                    recordsIds
                  );
                }
              }
            } else {
              if (recordGroupKeys[d]) {
                // If using emailField, get the email saved in the record data
                const { users, emails } = await resolveRecipientsFromEmails([
                  recordGroupKeys[d],
                ]);
                // Send one notification per user
                for (const user of users) {
                  await sendNotification(
                    pubsub,
                    preprocessNotificationTemplate(
                      template.content,
                      notificationType,
                      exporter.columns,
                      group,
                      user
                    ),
                    [user.email],
                    notification,
                    recordsIds
                  );
                }
                // Send one notification per email (not associated with a user)
                for (const email of emails) {
                  await sendNotification(
                    pubsub,
                    preprocessNotificationTemplate(
                      template.content,
                      notificationType,
                      exporter.columns,
                      group,
                      {
                        email,
                      }
                    ),
                    [email],
                    notification,
                    recordsIds
                  );
                }
              }
              success = true;
            }
            d++;
          }
        } else {
          const recordsIds = [];
          for (const record of newRecords) {
            if (redirectToRecords) {
              recordsIds.push(record._id);
            }
          }
          if (
            notification.recipientsType ===
            customNotificationRecipientsType.channel
          ) {
            // Recipient is a channel, get users linked to this channel through their roles
            const users = await resolveRecipientsFromChannels(recipients);
            // Send one notification per user
            for (const user of users) {
              await sendNotification(
                pubsub,
                preprocessNotificationTemplate(
                  template.content,
                  notificationType,
                  exporter.columns,
                  newRecords,
                  user
                ),
                [user.email],
                notification,
                recordsIds
              );
            }
            success = true;
          } else {
            // Recipient is a list of emails or users
            const { users, emails } = await resolveRecipientsFromEmails(
              recipients
            );
            // Send one notification per user
            for (const user of users) {
              await sendNotification(
                pubsub,
                preprocessNotificationTemplate(
                  template.content,
                  notificationType,
                  exporter.columns,
                  newRecords,
                  user
                ),
                [user.email],
                notification,
                recordsIds
              );
            }
            // Send one notification per email (not associated with a user)
            for (const email of emails) {
              await sendNotification(
                pubsub,
                preprocessNotificationTemplate(
                  template.content,
                  notificationType,
                  exporter.columns,
                  newRecords,
                  {
                    email,
                  }
                ),
                [email],
                notification,
                recordsIds
              );
            }

            success = true;
          }
        }
      }
    } else {
      await sendNotification(pubsub, template, recipients, notification);
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
