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
      user.roles.find((x) => x._id.toString() === '677298832fc2a0c65c171418')
    ) {
      countries = uniq([
        ...editableBRs.flatMap((doc) => doc.countries || []),
        user.attributes.country,
      ]).filter(Boolean);
    }
    // National commission
    if (
      user.roles.find((x) => x._id.toString() === '6772988c2fc2a0c65c171444')
    ) {
      countries = [user.attributes.country].filter((c) => c);
    }
    // National Focal Point
    if (
      user.roles.find((x) => x._id.toString() === '69971593bc875afe08a8dd6f')
    ) {
      // Editable BRs are all BRs in same country
      if (user.attributes.country) {
        editableBRs = await Record.aggregate([
          {
            $match: {
              resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
              'data.countries': user.attributes.country,
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
      countries = [user.attributes.country].filter((c) => c);
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
    set(
      user,
      'attributes._can_edit_brs',
      editableBRs.map((doc) => doc._id.toString())
    );
    set(
      user,
      'attributes._can_view_brs',
      viewableBRs.map((doc) => doc._id.toString())
    );
    user.markModified('attributes');
    return true;
  } catch {
    logger.error('Fail to update user attributes');
    return false;
  }
};
