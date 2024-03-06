import { isArray, isNil } from 'lodash';
import set from 'lodash/set';
import { PositionAttribute, Record } from '@models';

/**
 * Transforms uploaded row into record data, using fields definition.
 *
 * @param columns definition of structure columns.
 * @param row list of records
 * @returns list of export rows.
 */
export const loadRow = async (
  columns: any[],
  row: any
): Promise<{
  data: any;
  positionAttributes: PositionAttribute[];
  error?: { name: string; field: string };
}> => {
  const data = {};
  const positionAttributes = [];
  let error: { name: string; field: string } | null = null;
  for (const column of columns) {
    const value = row[column.index];
    if (!isNil(value)) {
      switch (column.type) {
        case 'boolean': {
          let val: string | number | boolean;
          if (typeof value === 'object' && value !== null) {
            val = value.result;
          } else {
            val = value;
          }
          if (
            (typeof val === 'number' && val === 1) ||
            (typeof val === 'string' && val.toLowerCase() === 'true') ||
            (typeof val === 'boolean' && val)
          ) {
            data[column.field] = true;
          } else {
            data[column.field] = false;
          }
          break;
        }
        case 'checkbox':
        case 'tagbox': {
          // Column is linked to a specific value
          if (!isNil(column.value)) {
            if (value === 1) {
              data[column.field] = (
                isArray(data[column.field]) ? data[column.field] : []
              ).concat(column.value);
            }
          } else {
            // General column for the field, so we can directly save the values in the record
            set(data, column.field, value.split(','));
          }
          break;
        }
        case 'multipletext': {
          set(data, `${column.field}.${column.item}`, value);
          break;
        }
        case 'matrix': {
          set(data, `${column.field}.${column.row}`, value);
          break;
        }
        case 'matrixdropdown': {
          set(data, `${column.field}.${column.row}.${column.column}`, value);
          break;
        }
        case '$attribute': {
          positionAttributes.push({
            value,
            category: column.category,
          });
          break;
        }
        case 'geospatial': {
          data[column.field] = JSON.parse(value);
          break;
        }
        case 'resource': {
          const record = await Record.findOne({
            _id: value,
            resource: column.resource,
          });
          if (!record) {
            error = {
              name: 'routes.upload.errors.resourceNotFound',
              field: column.field,
            };
            break;
          }
          data[column.field] = value;
        }
        default: {
          data[column.field] = value;
          break;
        }
      }
    } else if (column.isRequired) {
      error = {
        name: 'routes.upload.errors.requiredField',
        field: column.field,
      };
    }
    if (error) {
      break;
    }
  }
  return { data, positionAttributes, error };
};
