import { cloneDeep } from 'lodash';
import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLError,
  GraphQLBoolean,
  GraphQLString,
} from 'graphql';
import { getNextId, getOwnership } from '@utils/form';
import { Form, Record, Resource, User, Version } from '@models';
import extendAbilityForRecords from '@security/extendAbilityForRecords';
import { RecordType, ResourceType } from '../types';
import { logger } from '@services/logger.service';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';
import * as fs from 'fs';
import * as path from 'path';
import { hasInaccessibleFields } from './editRecord.mutation';

/** Arguments for the convertRecord mutation */
type ConvertRecordsArgs = {
  id: string | Types.ObjectId;
  initialType: string;
  newType: string;
  field: string;
  popArray: string;
  failedAction: string;
};

/** Conversion of type string to array
 *
 * @param value - string to convert
 * @returns - array of strings
 */
function stringToArray(value: string): any {
  try {
    return [value.toString()];
  } catch (err) {
    return 'error';
  }
}

/** Conversion of type array to string
 *
 * @param value - array of strings to convert
 * @param popArray - action to perform on the array
 * @returns - string
 */
function arrayToString(value: string[], popArray: string): string {
  try {
    switch (popArray) {
      case 'first':
        return value[0];
      case 'last':
        return value[value.length - 1];
      case 'all':
        return value.toString();
    }
  } catch (err) {
    return 'error';
  }
}

/** Conversion of any type to boolean
 *
 * @param value - value to convert
 * @returns - boolean
 */
function toBoolean(value: any): any {
  try {
    if (Array.isArray(value)) {
      return value.length > 0 ? true : false;
    } else {
      return !!value;
    }
  } catch (err) {
    console.log(err);
    console.log('a');
    return 'error';
  }
}

/** Conversion function
 *
 * @param value - value to convert
 * @param args - conversionForm args
 * @returns - converted value
 */
async function convertFieldValue(value: any, args): Promise<any> {
  try {
    switch (args.initialType) {
      case 'text':
      case 'dropdown':
      case 'radiogroup': {
        switch (args.newType) {
          case 'checkbox':
          case 'tagbox':
          case 'owner':
          case 'users':
            return stringToArray(value);
          case 'boolean':
            return toBoolean(value);
          case 'dropdown':
          case 'radiogroup':
          case 'text': {
            //do nothing
            break;
          }
        }
        break;
      }
      case 'checkbox':
      case 'tagbox': {
        switch (args.newType) {
          case 'text':
          case 'dropdown':
          case 'radiogroup': {
            return arrayToString(value, args.popArray);
          }
          case 'boolean': {
            return toBoolean(value);
          }
          case 'checkbox':
          case 'tagbox': {
            //do nothing
            break;
          }
        }
        break;
      }
      case 'boolean': {
        if (args.newType === 'text') {
          return toBoolean(value);
        }
      }
      case 'file':
      case 'multipletext':
      case 'matrix':
      case 'expression':
      case 'owner':
      case 'users': {
        if (args.newType === 'boolean') {
          return toBoolean(value);
        }
      }
      case 'resource': {
        switch (args.newType) {
          case 'resources': {
            return stringToArray(value);
          }
          case 'boolean': {
            return toBoolean(value);
          }
        }
        break;
      }
      case 'resources': {
        switch (args.newType) {
          case 'resource': {
            return arrayToString(value, args.popArray);
          }
          case 'boolean': {
            return toBoolean(value);
          }
        }
        break;
      }
      default: {
        console.log('b');
        return 'error';
      }
    }
  } catch (err) {
    console.log(err);
    console.log('c');
    return 'error';
  }
}

function writeToFile(filename: string, data: string): void {
  const filePath = path.join('C:\\Users\\bruno\\Documents', filename);
  fs.writeFileSync(filePath, data, 'utf-8');
}

/** Validate that the answer is in the question choices
 *
 * @param questionChoices - choices of the question
 * @param currentAnswer - answer to validate
 * @returns - true if the answer is in the question choices, false otherwise
 */
function validateChoices(
  questionChoices: string[],
  currentAnswer: string
): boolean {
  if (Array.isArray(currentAnswer)) {
    if (!currentAnswer.every((answer) => questionChoices.includes(answer))) {
      return false;
    }
  } else {
    if (!questionChoices.includes(currentAnswer)) {
      return false;
    }
  }
  return true;
}

/**
 * Convert all records from a given resource.
 *
 */
export default {
  type: RecordType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    initialType: { type: new GraphQLNonNull(GraphQLString) },
    newType: { type: new GraphQLNonNull(GraphQLString) },
    field: { type: new GraphQLNonNull(GraphQLString) },
    popArray: { type: GraphQLString },
    failedAction: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(parent, args: ConvertRecordsArgs, context: Context) {
    graphQLAuthCheck(context); // TODO: deal with permissions
    try {
      const oldRecords = await Record.find({ resource: args.id }).populate({
        path: 'form',
        model: 'Form',
      });
      const records: Record[] = [];
      const oldForm = await Promise.all(
        oldRecords.map((record) => Form.findById(record.form))
      );

      const formFieldStructure = oldForm
        .map((form) => form.fields)
        .flat()
        .find((field) => field.name === args.field);

      const user = context.user;

      // Considering the user edited the form before converting the records, questionChoices refers to the new form
      const questionChoices = formFieldStructure['choices']?.map(
        (item) => item.value
      );
      if (questionChoices) {
        questionChoices.push('other');
        questionChoices.push('none');
      }

      const beforeData = JSON.stringify(oldRecords, null, 2);
      writeToFile('before.txt', 'BEFORE\n' + beforeData);

      // Conversion loop
      for (const record of oldRecords) {
        let action = 'continue';
        const data = cloneDeep(record.data);
        const currentAnswer = data[args.field];
        const ability = await extendAbilityForRecords(user, record.form);
        if (
          ability.can('update', record) &&
          !hasInaccessibleFields(record, data[args.field], ability) &&
          currentAnswer
        ) {
          // Question choices validation
          if (
            (questionChoices &&
              !validateChoices(questionChoices, currentAnswer)) ||
            (await convertFieldValue(currentAnswer, args)) === 'error'
          ) {
            console.log('Error converting value');
            action = args.failedAction;
          }
          if (action === 'continue') {
            data[args.field] = await convertFieldValue(currentAnswer, args);
            console.log('Value converted successfully');
          }
          if (action === 'delete') {
            data[args.field] = null;
            console.log('Value deleted successfully');
          }

          if (action !== 'ignore') {
            const version = new Version({
              createdAt: record.modifiedAt
                ? record.modifiedAt
                : record.createdAt,
              data: record.data,
              createdBy: user._id,
            });
            const update: any = {
              data: { ...record.data, ...data },
              _lastUpdatedBy: {
                user: {
                  _id: user._id,
                  name: user.name,
                  username: user.username,
                },
              },
              $push: { versions: version._id },
            };
            const ownership = getOwnership(
              record.form.fields,
              data[args.field]
            ); // Update with template during merge
            Object.assign(
              update,
              ownership && { createdBy: { ...record.createdBy, ...ownership } }
            );
            const newRecord = await Record.findByIdAndUpdate(
              record.id,
              update,
              {
                new: true,
              }
            );
            await version.save();
            records.push(newRecord);
            console.log('Conversion completed');
            // to do: deal with cancel conversion
            // change the mutation response in conversion.component.ts
            // display success or failure message
          }
        }
      }
      const afterData = JSON.stringify(records, null, 2);
      writeToFile('after.txt', 'AFTER\n' + afterData);
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
