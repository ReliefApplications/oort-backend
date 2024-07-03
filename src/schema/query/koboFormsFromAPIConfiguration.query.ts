import {
  GraphQLID,
  GraphQLError,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
} from 'graphql';
import { Context } from '@server/apollo/context';
import { Types } from 'mongoose';
import { graphQLAuthCheck } from '@schema/shared';
import { logger } from '@services/logger.service';
import { ApiConfiguration } from '@models';
import config from 'config';
import axios from 'axios';
import * as CryptoJS from 'crypto-js';

/** Arguments for the koboFormsFromAPIConfiguration query */
type KoboFormsFromAPIConfigurationArgs = {
  apiConfiguration?: string | Types.ObjectId;
};

/** Define the GraphQLObjectType for a single kobo form */
const koboFormType = new GraphQLObjectType({
  name: 'KoboForm',
  fields: {
    title: { type: GraphQLString },
    id: { type: GraphQLString },
  },
});

/**
 * From a Kobotoolbox API configuration, get the name and id from all the forms of the Kobo profile
 * Throw GraphQL error if not logged.
 */
export default {
  type: new GraphQLList(koboFormType),
  args: {
    apiConfiguration: { type: new GraphQLNonNull(GraphQLID) },
  },
  async resolve(
    parent,
    args: KoboFormsFromAPIConfigurationArgs,
    context: Context
  ) {
    graphQLAuthCheck(context);
    try {
      const apiConfiguration = await ApiConfiguration.findById(
        args.apiConfiguration
      );
      const url = 'https://kc.kobotoolbox.org/api/v1/forms';
      const settings = JSON.parse(
        CryptoJS.AES.decrypt(
          apiConfiguration.settings,
          config.get('encryption.key')
        ).toString(CryptoJS.enc.Utf8)
      );
      // Get Kobotoolbox profile data
      const response = await axios.get(url, {
        headers: {
          // settings.tokenPrefix MUST be 'Token'
          Authorization: `Token ${settings.token}`,
        },
      });
      const koboForms: { title: string; id: string }[] = [];
      const forms = (response as any).data;
      forms.forEach((form: any) =>
        koboForms.push({ title: form.title, id: form.id_string })
      );

      return koboForms;
    } catch (err) {
      logger.error(err.message, { stack: err.stack });
      if (err instanceof GraphQLError) {
        throw new GraphQLError(err.message);
      }
      throw new GraphQLError(
        context.i18next.t('common.errors.internalServerError')
      );
    }
  },
};
