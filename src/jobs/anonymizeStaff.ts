import { Record, User } from '@models';
import { deleteFile } from '@utils/files';
import { Types } from 'mongoose';
import { posterizeAge } from './utils/posterizeAge';
import { logger } from '@services/logger.service';

/** Staff resource ID */
const STAFF_RESOURCE_ID = new Types.ObjectId('649e9ec5eae9f89219921eff');

/** Anonymizes the staff data, if didn't log in for more than 6 months */
export const anonymizeStaff = async () => {
  // Get all users with lastLogin 6 months ago
  const usersToDelete = await User.find({
    $expr: {
      $lt: [
        {
          $ifNull: ['$lastLogin', '$modifiedAt'],
        },
        new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000), // 6 months ago
      ],
    },
  });

  // Find all the records of staff with the users found above
  const usersStaffRecords = await Record.find({
    resource: STAFF_RESOURCE_ID,
    user: { $in: usersToDelete.map((user) => user._id) },
  });

  // Hide the info on the user
  usersToDelete.forEach((user) => {
    user.username = `${user._id.toString()}@oort-anonymous.com`;
    user.firstName = 'ANONYMOUS';
    user.lastName = 'ANONYMOUS';
    user.name = 'ANONYMOUS';
    user.roles = [];
    user.oid = null;
  });

  await User.bulkSave(usersToDelete);

  // Hold all files that should be deleted in blob storage
  const filesToDelete = [];

  // Hide info on the staff record
  usersStaffRecords.forEach((staffRecord) => {
    if (!staffRecord.data) {
      return;
    }

    // Add all files to delete
    (staffRecord.data.file_gdpr_staff || []).forEach((file) => {
      filesToDelete.push(file.content);
    });

    staffRecord.data = {
      ...staffRecord.data,
      nom_employes: 'ANONYMOUS',
      prenom_employes: 'ANONYMOUS',
      tel_staff: 'ANONYMOUS',
      email_staff: `${staffRecord.data.linked_user[0]}@oort-anonymous.com`,
      file_gdpr_staff: [],
      birthdate_employes: posterizeAge({
        birthdate: staffRecord.data.birthdate_employes,
      }),
    };
  });

  // Delete all files
  Promise.all(filesToDelete.map((file) => deleteFile('forms', file))).catch(
    (err) => {
      logger.error(`Error deleting files: ${err}`);
    }
  );

  // Save all the records
  await Record.bulkSave(usersStaffRecords);
};
