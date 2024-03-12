import { DEFAULT_INCREMENTAL_ID_SHAPE, Form, Resource } from '@models';
import { startDatabaseForMigration } from '../src/utils/migrations/database.helper';
import { logger } from '@services/logger.service';
import { isEqual } from 'lodash';

/**
 * Update resource, by populating idShape with customized form idShape
 *
 * @param form form to use to update resource
 */
const updateFormResource = async (form: Form) => {
  await Resource.findByIdAndUpdate(form.resource, {
    idShape: form.idShape,
  });
  logger.info(`[${form.resource.name}]: updated custom idShape.`);
};

/**
 * Sample function of up migration
 *
 * @returns just migrate data.
 */
export const up = async () => {
  await startDatabaseForMigration();
  // Update dashboard pages
  const forms = await Form.find().select('idShape resource');
  for (const form of forms) {
    if (form.idShape && !isEqual(form.idShape, DEFAULT_INCREMENTAL_ID_SHAPE)) {
      await updateFormResource(form);
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
