import { Record, User } from '@models';
import { Types } from 'mongoose';

/** Staff resource ID */
const AID_RESOURCE_ID = new Types.ObjectId('64e6e0933c7bf3962bf4f04c');

/** Anonymizes the beneficiary data, if didn't log in for more than 18 months */
export const anonymizeStaff = async () => {
  // Find all the records of Ais was given more than 18 months ago
  const allAids = await Record.find({
    resource: AID_RESOURCE_ID,
    createdAt: {
      $lt: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000),
    }, // 18 months ago
  });

  // Anonymize all members of that family
  for (let i = 0; i < allAids.length; i++) {
    const aidRecord = allAids[i];

    // Get Family record
    const familyRecord = await Record.findOne({
      _id: aidRecord?.data?.owner_resource,
    });

    // Find all members of the family
    const members = await Record.find({
      _id: { $in: familyRecord?.data?.members },
    });

    // Anonymize all members of that family
    for (let j = 0; j < members.length; j++) {
      const member = members[j];

      // Anonymize the member
      member._createdBy = new User({
        name: 'ANONYMOUS',
        username: `${Math.random()
          .toString(36)
          .substring(2, 15)}@anonymus-oort.com`,
      });
      member.data.location = 'ANONYMOUS';
      member.data.surname = 'ANONYMOUS';
      member.data.firstname = 'ANONYMOUS';
      member.data.phone = 'ANONYMOUS';
      member.data.nom_employes = 'ANONYMOUS';
      member.data.gender = 'ANONYMOUS';
      member.data.birthdate = 'ANONYMOUS';
      member.data.prenom_employes = 'ANONYMOUS';
      member.data.nom_prenom_employes = 'ANONYMOUS';
      member.data.tel_staff = 'ANONYMOUS';
      member.data.email_staff = 'ANONYMOUS';
      member.data.birthdate_employes = 'ANONYMOUS';
      member._lastUpdatedBy = new User({
        name: 'ANONYMOUS',
        username: `${Math.random()
          .toString(36)
          .substring(2, 15)}@anonymus-oort.com`,
      });
      member.data.file_gdpr_staff = [];

      await member.save();
    }
  }
};
