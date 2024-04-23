import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLError,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';
import { Record } from '@models';
import extendAbilityForRecords from '@security/extendAbilityForRecords';
import { logger } from '@services/logger.service';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import { recordEvent } from '@server/mixpanel';

/** Arguments for the deleteRecords mutation */
export type DeleteRecordsArgs = {
  ids: string[] | Types.ObjectId[];
  hardDelete?: boolean;
};

/**
 * Delete multiple records.
 * Throw an error if not logged or authorized.
 */
export default {
  type: GraphQLInt,
  args: {
    ids: { type: new GraphQLNonNull(new GraphQLList(GraphQLID)) },
    hardDelete: { type: GraphQLBoolean },
  },
  async resolve(parent, args: DeleteRecordsArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const user = context.user;

      // Get records and forms objects
      const toDelete: Record[] = [];
      const records: Record[] = await Record.find({
        _id: { $in: args.ids },
      }).populate({
        path: 'form',
        model: 'Form',
      });

      // Create list of records to delete
      for (const record of records) {
        // Check ability
        const ability = await extendAbilityForRecords(user, record.form);
        if (ability.can('delete', record)) {
          toDelete.push(record);
        }
      }

      // Delete the records
      if (args.hardDelete) {
        const result = await Record.deleteMany({
          _id: { $in: toDelete.map((x) => x._id) },
        });

        // Log events
        for (const record of toDelete) {
          if (record.form.logEvents) {
            recordEvent(
              'Delete record',
              record.form,
              record,
              user,
              args,
              null,
              'Record hard deleted. Record deleted along with many others'
            );
          }
        }

        return result.deletedCount;
      } else {
        const result = await Record.updateMany(
          { _id: { $in: toDelete.map((x) => x._id) } },
          {
            $set: { archived: true },
          },
          { new: true }
        );

        // Log events
        for (const record of toDelete) {
          if (record.form.logEvents) {
            recordEvent(
              'Delete record',
              record.form,
              record,
              user,
              args,
              null,
              'Record archived (soft deleted). Record archived along with many others'
            );
          }
        }

        return result.modifiedCount;
      }
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
