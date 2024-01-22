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

function stringToArray(value: string): string[] {
  return [value.toString()];
}

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

function toBoolean(value: string): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  } else {
    return !!value;
  }
}

async function textToId(value: string, args): Promise<string[]> {
  switch (args.newType) {
    case 'users':
    case 'owner':
      const id: string = await User.findOne({ name: value });
      if (!id) {
        throw new GraphQLError(`User with name ${value} does not exist.`);
      } else {
        return [id];
      }
    case 'resource':
      const resource: string = await Resource.findOne({ name: value });
      if (!resource) {
        throw new GraphQLError(`Resource with name ${value} does not exist.`);
      } else {
        return [resource];
      }
  }
}

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
        case 'users':
        case 'owner':
        case 'resource':
          return textToId(value, args);
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
      throw new GraphQLError(
        `Conversion from ${args.initialType} to ${args.newType} is not supported`
      );
    }
  }
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
      const user = context.user;
      const oldRecords = await Record.find({ resource: args.id });
      const oldForm = await Promise.all(
        oldRecords.map((record) => Form.findById(record.form))
      );

      const formFieldStructure = oldForm
        .map((form) => form.fields)
        .flat()
        .find((field) => field.name === args.field);

      //console.log('BEFORE', JSON.stringify(oldRecords, null, 2));

      oldRecords.forEach((record) => {
        const data = record.data;
        const currentAnswer = data[args.field];

        console.log(currentAnswer);
        data[args.field] = convertFieldValue(currentAnswer, args);

        // deal with choices
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
