/* eslint-disable @typescript-eslint/no-loop-func */
import { Record, Resource } from '@models';

let oldName = '';
let newName = '';
let updated = false;

/**
 * Interact over a filter array to update each filter object inside
 *
 * @param filterArray to be interacted over and update each object inside
 * @returns if any updated was made
 */
const updateNestedFilters = (filterArray: any) => {
  if (filterArray.filters) {
    let filtersUpdated = false;
    for (const nestedFilter of filterArray.filters) {
      filtersUpdated = updateNestedFilters(nestedFilter);
    }
    return filtersUpdated;
  } else if (filterArray.field && filterArray.field === oldName) {
    filterArray.field = newName;
    return true;
  }
};

/**
 * UPdated filters, updating the field name on filters arrays and object
 *
 * @param filters filters array or object to look for fields to update
 * @returns updated filters
 */
const updateFilters = (filters: any) => {
  for (const filter of filters) {
    if (filter.filters) {
      let filtersUpdated = false;
      for (const nestedFilter of filter.filters) {
        filtersUpdated = updateNestedFilters(nestedFilter);
      }
      updated = filtersUpdated ? true : updated;
    } else if (filter.field && filter.field === oldName) {
      filter.field = newName;
      updated = true;
    }
  }
  return filters;
};

/**
 * Check if any field name was updated to also update records and aggregation/layouts
 *
 * @param form form updated
 * @param fields list of fields
 * @returns if updates were made because of field names
 */
export const onUpdateFieldName = async (
  form: any,
  fields: any[]
): Promise<boolean> => {
  for (const field of fields) {
    if (field.hasOwnProperty('oldName') && field.oldName) {
      oldName = field.oldName;
      newName = field.name;
      // Update records data
      await Record.updateMany(
        {
          resource: form.resource,
          [`data.${oldName}`]: { $exists: true },
        },
        {
          $rename: {
            [`data.${oldName}`]: `data.${newName}`,
          },
        }
      );

      // Get resources
      const resources = await Resource.find({ _id: form.resource });
      // Iterate through each resource and update aggregations and layouts (if needed)
      for (const resource of resources) {
        // Iterate through each aggregation
        for (const aggregation of resource.aggregations) {
          // Update sourceFields that contains the field
          if (aggregation.sourceFields?.includes(oldName)) {
            // Rename the field in sourceFields
            aggregation.sourceFields = aggregation.sourceFields.filter(
              (item: any) => item !== oldName
            );
            aggregation.sourceFields.push(newName);
            updated = true;
          }

          // Update aggregations pipelines
          if (aggregation.pipeline.length) {
            for (const stage of aggregation.pipeline) {
              switch (stage.type) {
                case 'filter':
                  stage.form.filters = updateFilters(stage.form.filters);
                  break;
                case 'sort':
                  if (stage.form.field === oldName) {
                    stage.form.field = newName;
                    updated = true;
                  }
                  break;
                case 'user':
                  if (stage.form.field === oldName) {
                    stage.form.field = newName;
                    updated = true;
                  }
                  break;
                case 'group':
                  for (const groupBy of stage.form.groupBy) {
                    if (groupBy.field === oldName) {
                      groupBy.field = newName;
                      updated = true;
                    }
                    if (groupBy.expression.field === oldName) {
                      groupBy.expression.field = newName;
                      updated = true;
                    }
                  }
                  for (const addFields of stage.form.addFields) {
                    if (addFields.expression.field === oldName) {
                      addFields.expression.field = newName;
                      updated = true;
                    }
                  }
                  break;
                case 'label':
                  if (stage.form.field === oldName) {
                    stage.form.field = newName;
                    updated = true;
                  }
                  if (stage.form.copyFrom === oldName) {
                    stage.form.copyFrom = newName;
                    updated = true;
                  }
                  break;
                case 'unwind':
                  if (stage.form.field === oldName) {
                    stage.form.field = newName;
                    updated = true;
                  }
                  break;
                default:
                  break;
              }
            }
            if (updated) {
              // Necessary because mongoose can't detect the modifications in the nested property aggregations
              resource.markModified('aggregations');
            }
          }
        }

        // Iterate through each layout
        for (const layout of resource.layouts) {
          // Update fields that contains the field
          const fieldIndex = layout.query.fields?.findIndex(
            (layoutField: any) => layoutField.name === oldName
          );
          if (fieldIndex !== -1) {
            // Rename the field in the layout query fields
            layout.query.fields[fieldIndex] = {
              ...layout.query.fields[fieldIndex],
              name: newName,
            };
            updated = true;
          }

          // Update filters that contains the field
          layout.query.filter.filters = updateFilters(
            layout.query.filter.filters
          );

          // Update sort rules that contains the field
          for (const sort of layout.query.sort) {
            if (sort.field === oldName) {
              sort.field = newName;
              updated = true;
            }
          }

          // Update style rules that contains the field
          for (const style of layout.query.style) {
            if (style.filter) {
              style.filter.filters = updateFilters(style.filter.filters);
            }
            if (style.fields) {
              if (style.fields.includes(oldName)) {
                style.fields = style.fields.filter(
                  (item: any) => item !== oldName
                );
                style.fields.push(newName);
                updated = true;
              }
            }
          }

          if (updated) {
            // Necessary because mongoose can't detect the modifications in the nested property layouts
            resource.markModified('layouts');
          }
        }
        // If any aggregation or layout was updated, save the resource
        if (updated) {
          await resource.save();
        }
        return true;
      }
    }
  }
  return false;
};
