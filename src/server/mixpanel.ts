import config from 'config';
import { Form, Record } from '@models';
import { UserWithAbility } from './apollo/context';
import { EditFormArgs } from '@schema/mutation/editForm.mutation';
import { EditRecordArgs } from '@schema/mutation/editRecord.mutation';
import { AddRecordArgs } from '@schema/mutation/addRecord.mutation';
import { ConvertRecordArgs } from '@schema/mutation/convertRecord.mutation';
import { DeleteRecordsArgs } from '@schema/mutation/deleteRecords.mutation';
import { RestoreRecordArgs } from '@schema/mutation/restoreRecord.mutation';
import { DeleteRecordArgs } from '@schema/mutation/deleteRecord.mutation';
import { EditRecordsArgs } from '@schema/mutation/editRecords.mutation';

// Mixpanel factory
import Mixpanel from 'mixpanel';
let mixpanel;

/**
 * Init mixpanel connection to store logs
 */
export const initMixpanel = async () => {
  if (config.get('mixpanel.token') && config.get('mixpanel.host')) {
    mixpanel = Mixpanel.init(config.get('mixpanel.token'), {
      host: config.get('mixpanel.host'),
      debug: true,
    });
  }
};

/**
 * Register login event
 *
 * @param user user responsible for the action
 */
export const loginEvent = async (user: UserWithAbility) => {
  if (mixpanel) {
    mixpanel.track('Login', {
      distinct_id: user.id ?? user._id,
      user: user,
    });
  }
};

/**
 * Register creation/update of records events.
 *
 * @param type type of record event. It can be 'Add record', 'Edit record', 'Delete record', 'Convert record' or 'Restore record'
 * @param form form of the record
 * @param record record with the updated/new/deleted data
 * @param user user responsible for the action
 * @param args arguments of the record update
 * @param oldRecord record with the outdated data
 * @param details extra details about the event to be register
 * @param oldForm when converting record, the old form of the original record
 */
export const recordEvent = async (
  type:
    | 'Add record'
    | 'Edit record'
    | 'Delete record'
    | 'Convert record'
    | 'Restore record',
  form: Form,
  record: Record,
  user: UserWithAbility,
  args:
    | EditRecordArgs
    | EditRecordsArgs
    | AddRecordArgs
    | ConvertRecordArgs
    | DeleteRecordArgs
    | DeleteRecordsArgs
    | RestoreRecordArgs,
  oldRecord?: Record,
  details?: string,
  oldForm?: Form
) => {
  if (mixpanel) {
    mixpanel.track(type, {
      distinct_id: user.id ?? user._id,
      user: user,
      parentForm: form,
      editionArguments: args,
      record: record,
      ...(oldRecord && { recordOldData: oldRecord }),
      ...(oldForm && { oldForm: oldForm }),
      ...(details && { details: details }),
    });
  }
};

/**
 * Register form events.
 *
 * @param form form object without the updated data
 * @param args arguments of the form update
 * @param user user responsible for the action
 * @param details extra details about the event to be register
 */
export const editFormEvent = async (
  form: Form,
  args: EditFormArgs,
  user: UserWithAbility,
  details?: string
) => {
  if (mixpanel) {
    mixpanel.track('Edit form', {
      distinct_id: user.id ?? user._id,
      user: user,
      formId: form.id,
      formOldData: form,
      editionArguments: args,
      ...(details && { details: details }),
    });
  }
};
