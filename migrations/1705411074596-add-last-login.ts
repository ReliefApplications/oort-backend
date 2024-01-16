import { User } from '@models';
import { startDatabaseForMigration } from '../src/utils/migrations/database.helper';

/**
 *  Update lastLogin field.
 */
export const up = async () => {
  await startDatabaseForMigration();

  const users = await User.find({});
  for (const user of users) {
    // Create field lastLogin with value of modifiedAt
    user.lastLogin = user.modifiedAt;

    // Save user
    await user.save();
  }
};

/**
 * Sample function of down migration
 *
 * @returns just migrate data.
 */
export const down = async () => {
  /*
      Code you downgrade script here!
   */
};
