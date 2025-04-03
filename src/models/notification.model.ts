import { AccessibleRecordModel, accessibleRecordsPlugin } from '@casl/mongoose';
import mongoose, { Schema, Document, Types } from 'mongoose';
import { User } from './user.model';

/** Mongoose notification schema declaration */
const notificationSchema = new Schema(
  {
    action: String,
    content: mongoose.Schema.Types.Mixed,
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      default: [],
    },
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    seenBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'modifiedAt' },
  }
);

// notificationSchema.index(
//   { createdAt: 1 },
//   { expireAfterSeconds: 3600 * 24 * 30 }
// ); // After 60 days, the notification is erased

/** Notification documents interface declaration */
export interface Notification extends Document {
  kind: 'Notification';
  action: string;
  content: any;
  createdAt: Date;
  channel: any[];
  users: (User | Types.ObjectId)[];
  seenBy: (User | Types.ObjectId)[];
}

notificationSchema.plugin(accessibleRecordsPlugin);

/** Mongoose notification model definition */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Notification = mongoose.model<
  Notification,
  AccessibleRecordModel<Notification>
>('Notification', notificationSchema);
