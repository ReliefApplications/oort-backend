import config from 'config';
import i18next from 'i18next';
import jsonpath from 'jsonpath';
import fetch from 'node-fetch';
import { isEmpty, set } from 'lodash';
import { authType } from '@const/enumTypes';
import { ApiConfiguration, Record, User } from '@models';
import { logger } from '@lib/logger';
import { getDelegatedToken } from '../proxy';
import { AttributeSettings } from './userManagement';
import { Types } from 'mongoose';

/**
 * Check if we need to update user attributes and perform it when needed.
 *
 * @param user Logged user to update.
 * @param req Original req.
 * @returns Boolean to indicate if there is any change in the user.
 */
export const updateUserAttributes = async (
  user: User,
  req: any
): Promise<boolean> => {
  try {
    // Get settings
    const settings: AttributeSettings = config.get('user.attributes');
    // todo: not suitable at all as it will only work for MAB!
    // Update profile with all BRs it can view
    const editableBRs = await Record.aggregate([
      {
        $match: {
          resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
          'data.collaborators': user.id,
        },
      },
      {
        $project: {
          _id: 1,
          country: '$data.a_06_country',
        },
      },
    ]);
    let countries: string[] = [];
    // Biosphere manager
    if (
      user.roles.find((x) => x._id.toString() === '677298832fc2a0c65c171418')
    ) {
      countries = [
        ...editableBRs.map((doc) => doc.country).filter((c) => c),
        ...[user.attributes.country].filter((c) => c),
      ];
    }
    // National commission
    if (
      user.roles.find((x) => x._id.toString() === '6772988c2fc2a0c65c171444')
    ) {
      countries = [user.attributes.country].filter((c) => c);
    }
    const viewableBRs = await Record.aggregate([
      {
        $match: {
          resource: new Types.ObjectId('682e1d63839fa743ca474aa0'),
          'data.a_06_country': {
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
    // Check if we have correct settings to update user attributes from external system
    if (settings.local) return false;
    if (
      !settings.apiConfiguration ||
      !settings.endpoint ||
      !settings.mapping ||
      isEmpty(settings.mapping)
    ) {
      logger.error(
        i18next.t(
          'utils.user.updateUserAttributes.errors.missingObjectParameters',
          {
            object: 'user attributes settings',
          }
        )
      );
      return false;
    }
    // Get delegated token
    const upstreamToken = req.headers.authorization.split(' ')[1];
    let token: string;
    const apiConfiguration = await ApiConfiguration.findById(
      settings.apiConfiguration
    );
    if (apiConfiguration) {
      if (apiConfiguration.authType === authType.serviceToService) {
        token = await getDelegatedToken(
          apiConfiguration,
          user._id,
          upstreamToken
        );
      }
      // Pass it in headers
      const headers: any = token
        ? {
            Authorization: 'Bearer ' + token,
          }
        : {};
      // Fetch new attributes
      let res;
      try {
        res = await fetch(apiConfiguration.endpoint + settings.endpoint, {
          method: 'get',
          headers,
        });
      } catch (err) {
        logger.error(i18next.t('common.errors.invalidAPI'), {
          stack: err.stack,
        });
        return false;
      }
      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        logger.error(i18next.t('common.errors.authenticationTokenNotFound'), {
          stack: err.stack,
        });
        return false;
      }
      // Map them to user attributes
      for (const mapping of settings.mapping) {
        const value = jsonpath.value(data, mapping.value);
        set(user, mapping.field, value);
      }
      user.markModified('attributes');
      return settings.mapping.length > 0;
    } else {
      // Api configuration does not exist
      return false;
    }
  } catch {
    logger.error('Fail to update user attributes');
    return false;
  }
};
