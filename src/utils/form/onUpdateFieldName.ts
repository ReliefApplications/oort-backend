import { Record, Resource } from '@models';
// import i18next from 'i18next';

/**
 * Check if any field name was updated to also update records and aggregation/layouts
 *
 * @param form form updated
 * @param fields list of fields
 */
export const onUpdateFieldName = async (
  form: any,
  fields: any[]
): Promise<void> => {
  for (const field of fields) {
    if (field.hasOwnProperty('oldName') && field.oldName) {
      const oldName = field.oldName;
      const newName = field.name;
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
      // Update layouts source fields
      // TODO: update pipelines
      // const resources = await Resource.find({
      //   resource: form.resource,
      //   layouts: { $exists: true },
      // });
      // if (resources) {
      //   for (const resource of resources) {
      //     resource.layouts.forEach((layout) => {
      //       layout.query.fields.forEach((field) => )
      //     });
      //   }
      // }
      // Update aggregations source fields
      // TODO: update pipelines and fix it
      await Resource.updateMany(
        {
          resource: form.resource,
        },
        {
          $rename: {
            [`aggregations.sourceFields.${oldName}`]: `aggregations.sourceFields.${newName}`,
          },
        }
      );
    }
  }
};
