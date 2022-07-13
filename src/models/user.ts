import { AccessibleRecordModel, accessibleRecordsPlugin } from '@casl/mongoose';
import mongoose, { Schema, Document } from 'mongoose';
import { AppAbility } from '../security/defineAbilityFor';
import { PositionAttribute } from './positionAttribute';

/** Mongoose user schema definition */
const userSchema = new Schema({
  username: String,
  firstName: String,
  lastName: String,
  name: String,
  oid: String,
  roles: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
    },
  ],
  positionAttributes: {
    type: [PositionAttribute.schema],
  },
  favoriteApp: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
  },
  externalAttributes: {
    type: mongoose.Schema.Types.Mixed,
  },
  modifiedAt: Date,
});

/** User documents interface definition */
export interface User extends Document {
  kind: 'User';
  firstName?: string;
  lastName?: string;
  username?: string;
  name?: string;
  oid?: string;
  roles?: any[];
  positionAttributes?: PositionAttribute[];
  ability?: AppAbility;
  favoriteApp?: any;
  externalAttributes?: any;
  modifiedAt?: Date;
}

userSchema.index(
  { oid: 1 },
  { unique: true, partialFilterExpression: { oid: { $type: 'string' } } }
);
userSchema.index({ username: 1 }, { unique: true });
userSchema.plugin(accessibleRecordsPlugin);

/** Mongoose user model definition */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const User = mongoose.model<User, AccessibleRecordModel<User>>(
  'User',
  userSchema
);
