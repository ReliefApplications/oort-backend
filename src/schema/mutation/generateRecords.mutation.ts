import { GraphQLID, GraphQLError, GraphQLList } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { RecordType } from '../types';
import { Form, Record, Notification, Channel } from '@models';
import { getOwnership, getNextId, generateData } from '@utils/form';
import extendAbilityForRecords from '@security/extendAbilityForRecords';
import pubsub from '../../server/pubsub';
import { logger } from '@services/logger.service';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the generateRecords mutation */
type GenerateRecordArgs = {
  form: string | Types.ObjectId;
  data: any;
};

/**
 * Generate up to 50 records using user input or random data
 */
export default {
  type: new GraphQLList(RecordType),
  args: {
    form: { type: GraphQLID },
    data: { type: GraphQLJSON },
  },
  async resolve(parent, args: GenerateRecordArgs, context: Context) {
    // check permissions etc
    graphQLAuthCheck(context);
    try {
      const recordsNumber = args.data.recordsNumber;
      const formId = args.form;
      const fields = args.data.fieldsForm;
      const user = context.user;
      let records = [];

      const form = await Form.findById(formId);
      if (!form)
        throw new GraphQLError(context.i18next.t('common.errors.dataNotFound'));

      // Check the ability with permissions for this form
      const ability = await extendAbilityForRecords(user, form);
      if (ability.cannot('create', 'Record')) {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
      }

      for (let i = 0; i < recordsNumber; i++) {
        const { incrementalId, incID } = await getNextId(
          String(form.resource ? form.resource : args.form)
        );
        const generatedData = await generateData(fields, form);
        const record = new Record({
          incrementalId,
          incID,
          form: formId,
          data: generatedData,
          resource: form.resource ? form.resource : null,
          createdBy: {
            user: user._id,
            roles: user.roles.map((x) => x._id),
            positionAttributes: user.positionAttributes.map((x) => {
              return {
                value: x.value,
                category: x.category._id,
              };
            }),
          },
          lastUpdateForm: form.id,
          _createdBy: {
            user: {
              _id: context.user._id,
              name: context.user.name,
              username: context.user.username,
            },
          },
          _form: {
            _id: form._id,
            name: form.name,
          },
          _lastUpdateForm: {
            _id: form._id,
            name: form.name,
          },
        });
        records.push(record);
        // Update the createdBy property if we pass some owner data
        const ownership = getOwnership(form.fields, args.data);
        if (ownership) {
          record.createdBy = { ...record.createdBy, ...ownership };
        }
        await record.save();
      }

      // send notifications to channel
      const channel = await Channel.findOne({ form: form._id });
      if (channel) {
        const notification = new Notification({
          action: `${recordsNumber} generated records - ${form.name}`,
          content: records,
          channel: channel.id,
          seenBy: [],
        });
        await notification.save();
        const publisher = await pubsub();
        publisher.publish(channel.id, { notification });
      }
      return records;
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
