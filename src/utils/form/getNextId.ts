import {
  Record,
  Form,
  DEFAULT_INCREMENTAL_ID_SHAPE,
  ID_SHAPE_VARIABLES,
  Resource,
} from '@models';
import i18next from 'i18next';
import { isEqual } from 'lodash';
import { Types } from 'mongoose';
import { logger } from '@lib/logger';
import NodeCache from 'node-cache';

/** Maps each available variable to its template */
const TEMPLATES = {
  YEAR: '{year}',
  RESOURCE_INITIAL: '{resourceInitial}',
  RESOURCE_NAME: '{resourceName}',
  INCREMENTAL_NUM: '{incremental}',
} as const;

/** Local storage initialization */
const cache = new NodeCache();
/** Cache duration */
const CACHE_DURATION = 10;

/**
 * Extracts the first alphabetic character from a string.
 * Skips special characters, numbers, and whitespace.
 *
 * @param str The string to extract from.
 * @returns The first alphabetic character in uppercase, or empty string if none found.
 */
const getFirstAlphabeticChar = (str: string | undefined): string => {
  if (!str) return '';
  const match = str.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : '';
};

/**
 * Builds the incremental ID from the the shape string and an object with all the variables.
 *
 * @param idShape The shape id object.
 * @param variables The variables object.
 * @returns The incremental ID.
 */
export const buildIncrementalId = (
  idShape: Resource['idShape'],
  variables: { [key in ID_SHAPE_VARIABLES]: string }
) => {
  const { shape, padding } = idShape;
  let newID = shape;

  // {incremental} variable is mandatory
  if (shape.includes(TEMPLATES.INCREMENTAL_NUM) && variables.incremental) {
    newID = newID.replace(
      new RegExp(TEMPLATES.INCREMENTAL_NUM, 'g'),
      variables.incremental.padStart(padding, '0')
    );
  } else {
    throw new Error(i18next.t('utils.form.getNextId.errors.invalidShape'));
  }
  // {year} variable is optional
  if (shape.includes(TEMPLATES.YEAR) && variables.year) {
    newID = newID.replace(new RegExp(TEMPLATES.YEAR, 'g'), variables.year);
  }
  // {resourceInitial} variable is optional
  if (shape.includes(TEMPLATES.RESOURCE_INITIAL) && variables.resourceInitial) {
    newID = newID.replace(
      new RegExp(TEMPLATES.RESOURCE_INITIAL, 'g'),
      variables.resourceInitial
    );
  }
  // {resourceName} variable is optional
  if (shape.includes(TEMPLATES.RESOURCE_NAME) && variables.resourceName) {
    newID = newID.replace(
      new RegExp(TEMPLATES.RESOURCE_NAME, 'g'),
      variables.resourceName
    );
  }

  return newID;
};

/**
 * Updates all incremental IDs of a form
 *
 * @param resource Id or resource object.
 * @param newShape New shape of the incremental ID.
 * @param force Whether to force the update even if the shape is the same.
 */
export const updateIncrementalIds = async (
  resource: Resource | string | Types.ObjectId,
  newShape: Resource['idShape'],
  force = false
) => {
  // If form is a string, fetches the form object
  if (!(resource instanceof Resource)) {
    resource = await Resource.findOne(
      {
        _id: resource,
      },
      'name idShape _id'
    );
  }

  resource = resource as Resource;

  const { idShape: oldShape } = resource;

  // If the shape is the same, do nothing
  if (isEqual(oldShape, newShape) && !force) {
    return;
  }

  logger.log({
    level: 'info',
    message: `Updating incremental ids record from resource "${resource.name}"... (${oldShape.shape} -> ${newShape.shape})`,
  });

  const records = await Record.find({ resource: resource._id }).select(
    'incID createdAt _form'
  );
  let inc = 0;
  // Temporary update to avoid unique index issues
  for (const rec of records) {
    inc += 1;
    rec.incID = inc;
    rec.incrementalId = `${rec._id}_tmp`;
  }
  await Record.bulkSave(records);
  // Whether the new shape uses the year variable
  const usesYear = newShape.shape.includes(TEMPLATES.YEAR);
  inc = 0;
  for (let r = 0; r < records.length; r++) {
    const { createdAt } = records[r];
    const { createdAt: prevCreatedAt } = records[r - 1] ?? { createdAt: null };

    if (
      // If {year} is used in the shape
      usesYear &&
      // Checks if the previous record exists and that the year is different
      createdAt.getFullYear() !== prevCreatedAt?.getFullYear()
    ) {
      // Resets the counter
      inc = 0;
    }

    // Increments the counter
    inc += 1;

    const newIncrementalId = buildIncrementalId(newShape, {
      incremental: inc.toString(),
      year: createdAt.getFullYear().toString(),
      resourceInitial: getFirstAlphabeticChar(resource.name),
      resourceName: resource.name?.toUpperCase() || '',
    });

    records[r].incrementalId = newIncrementalId;
    records[r].incID = inc;
  }

  // Save the changes
  await Record.bulkSave(records);
};

/**
 * Gets next id of a form / resource, based on previous records.
 * Updates previous records if needed.
 *
 * @param structureId Id of the form / resource.
 * @returns New id for the record.
 */
export const getNextId = async (structureId: string | Form) => {
  // Gets the form name and id shape
  let resource: Resource = null;
  if (typeof structureId === 'string') {
    structureId = (await Form.findOne({
      $or: [{ _id: structureId }, { resource: structureId }],
    }).select('name resource')) as Form;
  }

  resource = await Resource.findOne({ _id: (structureId as Form).resource });
  const idShape = resource.idShape ?? DEFAULT_INCREMENTAL_ID_SHAPE;
  const name = resource.name;

  // Check if it's in the cache
  const cachedId: number | Promise<number> | undefined = cache.get(
    (structureId as Form).resource.toString()
  );

  // If it's in the cache, increment it and return
  if (cachedId) {
    const id = await cachedId;
    const incrementalId = buildIncrementalId(idShape, {
      incremental: id.toString(),
      year: new Date().getFullYear().toString(),
      resourceInitial: getFirstAlphabeticChar(name),
      resourceName: name?.toUpperCase() || '',
    });
    cache.set(
      (structureId as Form).resource.toString(),
      id + 1,
      CACHE_DURATION
    );
    return { incID: id, incrementalId };
  }

  /**
   * Promise to find the next id for the resource
   */
  const nextIdPromise = new Promise<number>(async (resolve) => {
    /** Gets the last id added to the form */
    const getLastID = async () => {
      const filters = {
        $and: [
          { resource: (structureId as Form).resource },
          // Only add the year filter if the id shape includes the year variable
          idShape.shape.includes(ID_SHAPE_VARIABLES.YEAR)
            ? {
                $expr: {
                  $eq: [{ $year: '$createdAt' }, new Date().getFullYear()],
                },
              }
            : {},
        ],
      };

      // Fetches the last record to get the last id used
      let lastRecord = await Record.findOne(filters)
        .sort({ _id: -1 })
        .limit(1)
        .select('incID');

      if (lastRecord && !lastRecord.incID) {
        // If the last record has no incID, it means it was created before the incID field was added
        // to the Record model. In this case, we need to update the incID of all records
        // to avoid duplicates.
        await updateIncrementalIds(resource, idShape, true);

        // Re-fetches the last record
        lastRecord = await Record.findOne(filters)
          .sort({ _id: -1 })
          .limit(1)
          .select('incID');
      }
      return lastRecord?.incID ?? null;
    };

    const nextID = ((await getLastID()) ?? 0) + 1;
    resolve(nextID);
  });

  // If not in cache, add it as a promise with the next id + 1
  cache.set(
    (structureId as Form).resource.toString(),
    new Promise((r) => nextIdPromise.then((id) => r(id + 1))),
    10
  );

  let incID = await nextIdPromise;
  let incrementalId = buildIncrementalId(idShape, {
    incremental: incID.toString(),
    year: new Date().getFullYear().toString(),
    resourceInitial: getFirstAlphabeticChar(name),
    resourceName: name?.toUpperCase() || '',
  });

  while (
    await Record.exists({
      resource: resource._id,
      incrementalId,
    })
  ) {
    incID += 1;
    incrementalId = buildIncrementalId(idShape, {
      incremental: incID.toString(),
      year: new Date().getFullYear().toString(),
      resourceInitial: getFirstAlphabeticChar(name),
      resourceName: name?.toUpperCase() || '',
    });
  }

  return { incID, incrementalId };
};
