import { referenceDataType } from '@const/enumTypes';
import {
  ApiConfiguration,
  Record as RecordModel,
  ReferenceData,
  Role,
  User,
} from '@models';
import { CustomAPI } from '@server/apollo/dataSources';
import { cloneDeep, get, isNil } from 'lodash';
import { Types } from 'mongoose';

type ValidatorSync<T> = (value: T) => boolean;
type ValidatorAsync<T> = (value: T) => Promise<boolean>;
type Validator<T> = ValidatorSync<T> | ValidatorAsync<T>;

/**
 * Get the choices for a field
 *
 * @param field The field
 * @param dataSources The data sources
 * @returns The choices for the field
 */
const getChoices = async (
  field: any,
  dataSources: Record<string, CustomAPI>
) => {
  let items: any[] = [];
  const refDataID = field?.referenceData?.id;

  if (refDataID) {
    const refData = await ReferenceData.findById(refDataID).populate({
      path: 'apiConfiguration',
      model: 'ApiConfiguration',
    });

    if (refData?.type === referenceDataType.static) {
      items = refData.data;
    } else {
      // If the reference data is dynamic, we call the API to get the data
      const apiConfiguration = refData.apiConfiguration as ApiConfiguration;
      const dataSource: CustomAPI = dataSources[apiConfiguration.name];
      if (dataSource) {
        items = await dataSource.getReferenceDataItems(
          refData,
          apiConfiguration
        );
      }
    }

    const choiceLabels = field.referenceData.displayField ?? refData.valueField;

    // If the reference data is static, we just map the data to the choices format
    return items.map((x) => ({
      text: String(get(x, choiceLabels, x)),
      value: String(get(x, refData.valueField, x)),
    }));
  }

  return get(field, 'choices', []);
};

/**
 * Get the new value for a field, formatted according to the new field definition
 *
 * @param value The value to be converted
 * @param field New field definition
 * @param dataSources The data sources
 * @param options Options for the conversion
 * @param options.strategyForArrays Strategy to use when the value is an array
 * @param options.onConversionFail What to do when the value does not match the new field type
 * @returns The new value, formatted according to the new field definition
 */
export const getNewFieldValue = (
  value: unknown,
  field: any,
  dataSources: Record<string, CustomAPI>,
  options: {
    strategyForArrays: 'first' | 'last' | 'random';
    onConversionFail: 'skip' | 'ignore' | 'archive';
  }
) => {
  // If the value is nullish, return null
  if (isNil(value)) {
    return null;
  }

  const type = field.type;

  const getValue = async <T>(opt: {
    useArray?: boolean;
    keepPreviousValue?: boolean;
    validator?: Validator<T>;
    converter?: (value: unknown) => T;
  }): Promise<any> => {
    const { useArray, keepPreviousValue, validator, converter } = opt;
    let val = value;
    // Nullish values are valid
    if (isNil(val)) {
      return null;
    }

    // Update the value if it is an array
    if (!useArray && Array.isArray(val)) {
      const array = val as any[];
      const strategy = options.strategyForArrays;

      switch (strategy) {
        case 'first':
          val = array[0];
          break;
        case 'last':
          val = array[array.length - 1];
          break;
        case 'random':
          val = array[Math.floor(Math.random() * array.length)];
      }
    } else if (useArray && !Array.isArray(val)) {
      val = [val];
    }

    const previousValue = cloneDeep(val);
    // Convert the value if a converter is provided
    if (converter) {
      val = converter(val);
    }

    // Validate the value if a validator is provided
    if (validator && !(await validator(val as T))) {
      throw new Error('The value does not match the new field type');
    }

    return keepPreviousValue ? previousValue : (val as T);
  };

  switch (type) {
    case 'color':
      return getValue<string>({
        // Check if it is a valid hex color
        validator: (color) => /^#[0-9A-F]{6}$/i.test(color),
        converter: (val) => val.toString(),
      });
    case 'date':
      return getValue<string>({
        validator: (date) => {
          const isValid = /^\d{4}-\d{2}-\d{2}$/.test(date);

          if (!isValid) {
            return false;
          }

          const [year, month, day] = date.split('-').map(Number);
          return year > 0 && month > 0 && month < 13 && day > 0 && day < 32;
        },
        converter: (val) => val.toString(),
      });
    case 'month':
      return getValue<string>({
        validator: (date) => {
          const isValid = /^\d{4}-\d{2}$/.test(date);

          if (!isValid) {
            return false;
          }

          const [year, month] = date.split('-').map(Number);
          return year > 0 && month > 0 && month < 13;
        },
        converter: (val) => val.toString(),
      });
    case 'week':
      return getValue<string>({
        validator: (date) => /^\d{4}-W\d{2}$/.test(date),
        converter: (val) => val.toString(),
      });
    case 'time':
    case 'datetime-local':
      return getValue<Date>({
        validator: (date) => !isNaN(date.getTime()),
        converter: (val) => new Date(val.toString()),
        keepPreviousValue: true,
      });
    case 'numeric':
      return getValue({
        validator: (num: number) => !isNaN(num),
        converter: (val) => Number(val),
      });
    case 'email':
      return getValue({
        validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        converter: (val) => val.toString(),
      });
    case 'radiogroup':
    case 'dropdown':
      return getValue({
        validator: async (val: string) => {
          const choices = await getChoices(field, dataSources);
          return choices.map((c) => `${c.value}`).includes(`${val}`);
        },
        converter: (val) => val.toString(),
      });
    case 'checkbox':
    case 'tagbox':
      return getValue<string[]>({
        useArray: true,
        validator: async (val) => {
          const choices = await getChoices(field, dataSources);
          // If we are skipping invalid values, we remove them from the array
          if (options.onConversionFail === 'skip') {
            const newVal = val.filter((v) =>
              choices.map((c) => `${c.value}`).includes(v)
            );
            val.splice(0, val.length);
            val.push(...newVal);
          } else if (options.onConversionFail === 'archive') {
            // If not all values are valid, we throw an error
            if (
              val.some((v) => !choices.map((c) => `${c.value}`).includes(v))
            ) {
              throw new Error('Some values do not match the new field type');
            }
          }

          return true;
        },
        converter: (val: any[]) => val.map(String),
      });
    case 'boolean':
      return getValue<boolean>({
        converter: (val) => (Array.isArray(val) ? val.length > 0 : !!val),
      });
    case 'text':
      return getValue<string>({
        converter: (val) => val.toString(),
      });
    case 'owner':
      return getValue<string[]>({
        useArray: true,
        converter: (val: any[]) => val.map(String),
        validator: async (val) => {
          const distinctRoles = new Set(val);
          const rolesCount = await Role.countDocuments({
            _id: {
              $in: [...distinctRoles],
            },
            application: {
              $in: field.applications ?? [],
            },
          });

          return rolesCount === distinctRoles.size;
        },
      });

    case 'resource':
      return getValue<string>({
        validator: async (val) => {
          const recordExists = await RecordModel.exists({
            _id: new Types.ObjectId(val),
            resource: new Types.ObjectId(field.resource),
          });

          return !!recordExists;
        },
        converter: (val) => val.toString(),
      });
    case 'resources':
      return getValue<string[]>({
        useArray: true,
        converter: (val: any[]) => val.map(String),
        validator: async (val) => {
          const records = await RecordModel.find({
            _id: {
              $in: val.map((v) => new Types.ObjectId(v)),
            },
            resource: new Types.ObjectId(field.resource),
          }).select('_id');

          // If we are skipping invalid values, we remove them from the array
          if (options.onConversionFail === 'skip') {
            const newVal = records.map((r) => r._id.toString());
            val.splice(0, val.length);
            val.push(...newVal);
          } else if (options.onConversionFail === 'archive') {
            // If not all values are valid, we throw an error
            if (records.length !== val.length) {
              throw new Error('Some values do not match the new field type');
            }
          }

          return true;
        },
      });
    case 'users':
      return getValue<string[]>({
        useArray: true,
        converter: (val: any[]) => val.map(String),
        validator: async (val) => {
          const distinctUsers = new Set(val);
          const usersCount = await User.countDocuments({
            _id: {
              $in: [...distinctUsers],
            },
          });

          return usersCount === distinctUsers.size;
        },
      });
    default:
      // file, multipletext, paneldynamic, matrices...
      throw new Error('Conversion not implemented for this field type');
  }
};
