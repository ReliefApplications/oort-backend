import { set, uniq } from 'lodash';
import { Record, User } from '@models';
import { logger } from '@lib/logger';
import { Types } from 'mongoose';

/**
 * Check if we need to update user attributes and perform it when needed.
 *
 * @param user Logged user to update.
 * @returns Boolean to indicate if there is any change in the user.
 */
export const updateUserAttributes = async (user: User): Promise<boolean> => {
  try {
    const userCountry = user.attributes?.country;
    const userRoles = user.roles || [];

    // todo: not suitable at all as it will only work for MAB!
    // Update profile with all BRs it can view
    let editableBRs = await Record.aggregate([
      {
        $match: {
          resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
          'data.collaborators': user.id,
        },
      },
      {
        $project: {
          _id: 1,
          countries: '$data.countries',
        },
      },
    ]);
    let countries: string[] = [];
    // Biosphere manager
    if (
      userRoles.find((x) => x._id.toString() === '677298832fc2a0c65c171418')
    ) {
      countries = uniq([
        ...editableBRs.flatMap((doc) => doc.countries || []),
        userCountry,
      ]).filter(Boolean);
    }
    // National commission
    if (
      userRoles.find((x) => x._id.toString() === '6772988c2fc2a0c65c171444')
    ) {
      countries = [userCountry].filter((c) => c);
    }
    // National Focal Point
    if (
      userRoles.find((x) => x._id.toString() === '69971593bc875afe08a8dd6f')
    ) {
      // Editable BRs are all BRs in same country
      if (userCountry) {
        editableBRs = await Record.aggregate([
          {
            $match: {
              resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
              'data.countries': userCountry,
            },
          },
          {
            $project: {
              _id: 1,
              countries: '$data.countries',
            },
          },
        ]);
      } else {
        editableBRs = [];
      }
      countries = [userCountry].filter((c) => c);
    }
    const viewableBRs = await Record.aggregate([
      {
        $match: {
          resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
          'data.countries': {
            $in: countries,
          },
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ]);
    const editableBRIds = editableBRs.map((doc) => doc._id.toString());
    const viewableBRIds = uniq([
      ...viewableBRs.map((doc) => doc._id.toString()),
      ...editableBRIds,
    ]);

    set(user, 'attributes._can_edit_brs', editableBRIds);
    set(user, 'attributes._can_view_brs', viewableBRIds);
    user.markModified('attributes');
    return true;
  } catch (err) {
    logger.error('Fail to update user attributes');
    return false;
  }
};
