import { Record, User } from '@models';
import { Types } from 'mongoose';

/** Staff resource ID */
const AID_RESOURCE_ID = new Types.ObjectId('64e6e0933c7bf3962bf4f04c');
const FAMILY_RESOURCE_ID = new Types.ObjectId('64de75fd3fb2a11c988dddb2');

/** Anonymizes the beneficiary data, if didn't log in for more than 18 months */
export const anonymizeBeneficiaries = async () => {
  // For all family records, check if
  // in the last 18 months they received aid

  // Get all the family records
  const allFamilies = await Record.find({
    resource: FAMILY_RESOURCE_ID,
  });

  // For each family record, check if exists
  // an aid record in the last 18 months
  for (const family of allFamilies) {
    const aidGivenToFamily = await Record.exists({
      resource: AID_RESOURCE_ID,
      createdAt: {
        $gt: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000),
      }, // 18 months ago
      'data.owner_resource': family._id.toString(),
    });

    // If no aid was given to the family in the last 18 months
    if (!aidGivenToFamily) {
      // Find all members of the family
      const members = await Record.find({
        _id: { $in: family?.data?.members },
      });

      // Anonymize all the members
      members.forEach((member) => {
        if (!member.data) {
          return;
        }
        // Anonymize the member
        member._createdBy = new User({
          name: 'ANONYMOUS',
          username: `${member._id.toString()}@oort-anonymous.com`,
        });

        member.data = {
          ...member.data,
          location: 'ANONYMOUS',
          surname: 'ANONYMOUS',
          firstname: 'ANONYMOUS',
          phone: 'ANONYMOUS',
          nom_employes: 'ANONYMOUS',
          gender: 'ANONYMOUS',
          birthdate: 'ANONYMOUS',
          prenom_employes: 'ANONYMOUS',
          nom_prenom_employes: 'ANONYMOUS',
          tel_staff: 'ANONYMOUS',
          email_staff: 'ANONYMOUS',
          birthdate_employes: 'ANONYMOUS',
          file_gdpr_staff: [],
        };

        member._lastUpdatedBy = new User({
          name: 'ANONYMOUS',
          username: `${member._id.toString()}@oort-anonymous.com`,
        });
      });

      // Save all the records
      await Record.bulkSave(members);
    }
  }
};
