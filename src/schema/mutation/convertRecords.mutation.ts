import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLError,
  GraphQLBoolean,
  GraphQLString,
} from 'graphql';
import { getNextId } from '@utils/form';
import { Form, Record, Resource, User } from '@models';
import extendAbilityForRecords from '@security/extendAbilityForRecords';
import { RecordType, ResourceType } from '../types';
import { logger } from '@services/logger.service';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

/** Arguments for the convertRecord mutation */
type ConvertRecordsArgs = {
  id: string | Types.ObjectId;
  initialType: string;
  newType: string;
  field: string;
  selectedResource: string;
  popArray: string;
};

/** Conversion of type string to array
 *
 * @param value - string to convert
 * @returns - array of strings
 */
function stringToArray(value: string): string[] {
  return [value.toString()];
}

/** Conversion of type array to string
 *
 * @param value - array of strings to convert
 * @param popArray - action to perform on the array
 * @returns - string
 */
function arrayToString(value: string[], popArray: string): string {
  switch (popArray) {
    case 'first':
      return value[0];
    case 'last':
      return value[value.length - 1];
    case 'all':
      return value.toString();
  }
}

/** Conversion of any type to boolean
 *
 * @param value - value to convert
 * @returns - boolean
 */
function toBoolean(value: string): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  } else {
    return !!value;
  }
}

/** Conversion of text to resource.
 *
 * @param value - text to convert
 * @param newType - type of the new field
 * @returns - array of a single id
 */
async function textToResource(value: string): Promise<string[]> {
  const record: string = await Record.findOne({ name: value });
  if (!record) {
    //throw new GraphQLError(`Record with name ${value} does not exist.`);
    console.log(`Record with name ${value} does not exist.`);
  } else {
    return [record];
  }
}

/** Conversion function
 *
 * @param value - value to convert
 * @param args - conversionForm args
 * @returns - converted value
 */
function convertFieldValue(value: any, args): any {
  switch (args.initialType) {
    case 'text':
    case 'dropdown':
    case 'radiogroup': {
      switch (args.newType) {
        case 'checkbox':
        case 'tagbox':
          return stringToArray(value);
        case 'boolean':
          return toBoolean(value);
        case 'resource':
          return textToResource(value);
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
      return null;
    }
  }
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

/** Validate that the answer is a record from the specified resource
 *
 * @param selectedResource - resource to validate
 * @param currentAnswer - answer to validate
 * @returns - true if the answer is a record from the specified resource, false otherwise
 */
async function enforceResource(
  selectedResource: string,
  currentAnswer: string
): Promise<boolean> {
  if (selectedResource !== 'none') {
    const record = await (
      await Record.find({
        resource: selectedResource,
      })
    ).map((record) => record.id);
    return record.includes(currentAnswer) ? true : false;
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
    selectedResource: { type: GraphQLString },
    popArray: { type: GraphQLString },
    failedAction: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(parent, args: ConvertRecordsArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const oldRecords = await Record.find({ resource: args.id });
      const oldForm = await Promise.all(
        oldRecords.map((record) => Form.findById(record.form))
      );

      const formFieldStructure = oldForm
        .map((form) => form.fields)
        .flat()
        .find((field) => field.name === args.field);

      // Considering the user edited the form before converting the records, questionChoices refers to the new form
      const questionChoices = formFieldStructure['choices']?.map(
        (item) => item.value
      );
      if (questionChoices) {
        questionChoices.push('other');
        questionChoices.push('none');
      }
      //console.log('BEFORE', JSON.stringify(oldRecords, null, 2));

      oldRecords.forEach((record) => {
        const data = record.data;
        const currentAnswer = data[args.field];

        if (questionChoices && currentAnswer) {
          if (!validateChoices(questionChoices, currentAnswer)) {
            console.log('Invalid choices');
          }
        }
        if (args.selectedResource) {
          if (!enforceResource(args.selectedResource, currentAnswer)) {
            console.log('Invalid resource');
          }
        }

        if (convertFieldValue(currentAnswer, args)) {
          data[args.field] = convertFieldValue(currentAnswer, args);
        } else {
          console.log('Invalid conversion');
        }
      });

      //console.log('AFTER', JSON.stringify(oldRecords, null, 2));
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
