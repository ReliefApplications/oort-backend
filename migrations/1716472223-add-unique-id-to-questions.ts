import { Form } from '@models';
import { startDatabaseForMigration } from '../src/utils/migrations/database.helper';
import { logger } from '@services/logger.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sample function of up migration
 */
export const up = async () => {
  await startDatabaseForMigration();
  // Update forms fields adding a new unique id for each field (question form)
  const coreForms = await Form.find({ core: true }).select(
    'fields name resource'
  );

  for (const coreForm of coreForms) {
    // Start updating core forms
    const coreFieldsToSave = [];
    for (let field of coreForm.fields) {
      field = {
        ...field,
        oid: uuidv4(),
      };
      coreFieldsToSave.push(field);
    }
    coreForm.fields = coreFieldsToSave;
    await coreForm.save();
    logger.info(
      `Form [${coreForm.name}]: updated fields with a unique id for each.`
    );
    // Update child forms (keep core fields with same id)
    const childForms = await Form.find({
      core: { $ne: true },
      resource: coreForm.resource,
    }).select('fields name resource');
    if (childForms) {
      for (const child of childForms) {
        const childFieldsToSave = [];
        for (let childField of child.fields) {
          if (!childField.isCore) {
            childField = {
              ...childField,
              oid: uuidv4(),
            };
          } else {
            const coreId = coreForm.fields.find(
              (field) => field.name === childField.name
            ).oid;
            childField = {
              ...childField,
              oid: coreId,
            };
          }
          childFieldsToSave.push(childField);
        }
        child.fields = childFieldsToSave;
        await child.save();
        logger.info(
          `Form [${child.name}] (child form): updated fields with a unique id for each.`
        );
      }
    }
  }
};

/**
 * Sample function of down migration
 *
 * @returns just migrate data.
 */
export const down = async () => {
  /*
      Code you downgrade script here!
   */
};
