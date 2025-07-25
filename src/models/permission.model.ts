import { AccessibleRecordModel, accessibleRecordsPlugin } from '@casl/mongoose';
import mongoose, { Schema, Document } from 'mongoose';

/** Mongoose permission schema declaration */
const permissionSchema = new Schema({
  type: {
    type: String,
    required: true,
  },
  global: Boolean,
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
  },
});

permissionSchema.index({ type: 1, global: 1 }, { unique: true });

/** Permission documents interface declaration */
export interface Permission extends Document {
  kind: 'Permission';
  type?: string;
  global?: boolean;
  application?: any;
}

permissionSchema.plugin(accessibleRecordsPlugin);

/** Mongoose permission model definition */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Permission = mongoose.model<
  Permission,
  AccessibleRecordModel<Permission>
>('Permission', permissionSchema);
