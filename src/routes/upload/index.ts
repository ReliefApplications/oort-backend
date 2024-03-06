import express from 'express';
import { CellHyperlinkValue, CellValue, Workbook } from 'exceljs';
import {
  Form,
  PositionAttribute,
  PositionAttributeCategory,
  Record,
  Role,
  Resource,
  Version,
  Application,
  DEFAULT_IMPORT_FIELD,
} from '@models';
import { AppAbility } from '@security/defineUserAbility';
import { Types } from 'mongoose';
import { getUploadColumns, loadRow, uploadFile } from '@utils/files';
import { getNextId, getOwnership } from '@utils/form';
import i18next from 'i18next';
import get from 'lodash/get';
import { logger } from '@services/logger.service';
import { accessibleBy } from '@casl/mongoose';
import { insertRecords as insertRecordsPulljob } from '@server/pullJobScheduler';
import jwtDecode from 'jwt-decode';
import { cloneDeep, has, isEqual } from 'lodash';
import { Context } from '@server/apollo/context';

/** File size limit, in bytes  */
const FILE_SIZE_LIMIT = 7 * 1024 * 1024;

/** Import data from user-uploaded files */
const router = express.Router();

/** Interface of DataSet */
export type DataSet = {
  data: any;
  positionAttributes: PositionAttribute[];
  id: string | null;
};

/**
 * Insert records from file if authorized.
 *
 * @param res Request's response.
 * @param file File with records to insert.
 * @param form Form template for records.
 * @param fields Fields template for records.
 * @param context Context
 * @returns request with success status
 */
async function insertRecords(
  res: any,
  file: any,
  form: Form,
  fields: any[],
  context: Context
) {
  // Check if the user is authorized
  const ability: AppAbility = context.user.ability;
  let canCreate = false;
  if (ability.can('create', 'Record')) {
    canCreate = true;
  } else {
    const roles = context.user.roles.map((x) => new Types.ObjectId(x._id));
    const canCreateRoles = get(
      form,
      'resource.permissions.canCreateRecords',
      []
    );
    canCreate =
      canCreateRoles.length > 0
        ? canCreateRoles.some((x) => roles.includes(x))
        : true;
  }
  const canUpdate = ability.can('update', 'Record');
  // Check unicity of record
  // TODO: this is always breaking
  // if (form.permissions.recordsUnicity) {
  //     const unicityFilter = getRecordAccessFilter(form.permissions.recordsUnicity, Record, req.context.user);
  //     if (unicityFilter) {
  //         const uniqueRecordAlreadyExists = await Record.exists({ $and: [{ form: form._id }, unicityFilter] });
  //         canCreate = !uniqueRecordAlreadyExists;
  //     }
  // }
  if (canCreate && canUpdate) {
    const workbook = new Workbook();
    await workbook.xlsx.load(file.data);
    const worksheet = workbook.getWorksheet(1);

    // Preprocess the worksheet to remove hyperlinks
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        // check if cell is CellHyperlinkValue
        if (has(cell.value, 'hyperlink')) {
          cell.value = (cell.value as CellHyperlinkValue).hyperlink;
        }
      });
    });

    const headerRow = worksheet.getRow(1).values as CellValue[];
    // Remove the first row (header) from the worksheet
    worksheet.spliceRows(1, 1);
    const columns = getUploadColumns(fields, headerRow);

    // find the index of the import field
    const importField = form.importField;
    const importFieldIndex = headerRow.findIndex(
      (cell) => cell === importField
    );

    // Get an array of ids to check if the record already exists
    const existingRecords = worksheet
      .getColumn(importFieldIndex)
      ?.values.map((x) => x.valueOf())
      .filter((x) => !!x);

    const oldRecords = await Record.find({
      form: form.id,
      ...(importField === DEFAULT_IMPORT_FIELD.incID
        ? { incrementalId: { $in: existingRecords } }
        : { [`data.${importField}`]: { $in: existingRecords } }),
    });

    const versionsToCreate: Version[] = [];
    const recordsToCreate: Record[] = [];
    const recordToUpdate: Record[] = [];
    let errorOnRow = null;
    await new Promise<void>((resolve) => {
      worksheet.eachRow(
        { includeEmpty: false },
        async function (row, rowNumber) {
          const { data, positionAttributes, error } = await loadRow(
            columns,
            row.values
          );
          if (error) {
            errorOnRow = error;
            resolve();
          }
          const oldRecord = oldRecords.find((rec) =>
            importField === DEFAULT_IMPORT_FIELD.incID
              ? rec.incrementalId === row.getCell(importFieldIndex).value
              : rec.data[importField] === row.getCell(importFieldIndex).value
          );

          // If the record already exists, update it and create a new version
          if (oldRecord) {
            const updatedRecord = cloneDeep(oldRecord);
            const version = new Version({
              createdAt: oldRecord.modifiedAt
                ? oldRecord.modifiedAt
                : oldRecord.createdAt,
              data: oldRecord.data,
              createdBy: context.user.id,
            });
            versionsToCreate.push(version);
            updatedRecord.versions.push(version);
            updatedRecord.markModified('versions');

            const ownership = getOwnership(fields, data);
            updatedRecord._createdBy = {
              ...updatedRecord._createdBy,
              ...ownership,
            };
            updatedRecord.modifiedAt = new Date();
            updatedRecord.data = { ...updatedRecord.data, ...data };

            if (!isEqual(oldRecord.data, updatedRecord.data)) {
              recordToUpdate.push(updatedRecord);
            }
          } else {
            recordsToCreate.push(
              new Record({
                form: form.id,
                data: data,
                resource: form.resource ? form.resource : null,
                createdBy: {
                  positionAttributes: positionAttributes,
                  user: context.user._id,
                },
                lastUpdateForm: form.id,
                _createdBy: {
                  user: {
                    _id: context.user._id,
                    name: context.user.name,
                    username: context.user.username,
                  },
                },
                _form: {
                  _id: form._id,
                  name: form.name,
                },
                _lastUpdateForm: {
                  _id: form._id,
                  name: form.name,
                },
              })
            );
          }
          if (rowNumber === worksheet.rowCount) {
            resolve();
          }
        }
      );
    });

    if (errorOnRow) {
      return res.status(400).send({
        status: i18next.t(errorOnRow.name, {
          field: errorOnRow.field,
        }),
      });
    }
    // Set the incrementalIDs of new records
    for (let i = 0; i < recordsToCreate.length; i += 1) {
      // It's ok to use await here because it'll be cached
      // from the second iteration onwards
      const { incrementalId, incID } = await getNextId(form);
      recordsToCreate[i].incrementalId = incrementalId;
      recordsToCreate[i].incID = incID;
    }

    const recordsToSave = [...recordsToCreate, ...recordToUpdate];

    // If no new data, return
    if (recordsToSave.length === 0) {
      return res.status(200).send({ status: 'No record added.' });
    }

    try {
      // Save all changes
      await Version.bulkSave(versionsToCreate);
      await Record.bulkSave(recordsToSave);
      return res.status(200).send({ status: 'OK' });
    } catch (err) {
      logger.error(err.message, { stack: err.stack });
      return res
        .status(500)
        .send(i18next.t('common.errors.internalServerError'));
    }
  } else {
    return res
      .status(403)
      .send(i18next.t('common.errors.permissionNotGranted'));
  }
}

/**
 * Import a list of records for a form from an uploaded xlsx file
 */
router.post('/form/records/:id', async (req: any, res) => {
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    // Get the file from request
    const file = req.files.excelFile;
    // Check file size
    if (file.size > FILE_SIZE_LIMIT)
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    // Check file extension (only allowed .xlsx)
    if (file.name.match(/\.[0-9a-z]+$/i)[0] !== '.xlsx')
      return res
        .status(400)
        .send(i18next.t('common.errors.fileExtensionNotAllowed'));

    const form = await Form.findById(req.params.id);

    // Check if the form exist
    if (!form)
      return res.status(404).send(i18next.t('common.errors.dataNotFound'));

    // Insert records if authorized
    return await insertRecords(res, file, form, form.fields, req.context);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/**
 * Import a list of records for a resource from an uploaded xlsx file
 */
router.post('/resource/records/:id', async (req: any, res) => {
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    // Get the file from request
    const file = req.files.excelFile;
    // Check file size
    if (file.size > FILE_SIZE_LIMIT)
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    // Check file extension (only allowed .xlsx)
    if (file.name.match(/\.[0-9a-z]+$/i)[0] !== '.xlsx')
      return res
        .status(400)
        .send(i18next.t('common.errors.fileExtensionNotAllowed'));

    const form = await Form.findOne({ resource: req.params.id, core: true });
    const resource = await Resource.findById(req.params.id);
    // Check if the form and the resource exist
    if (!form || !resource)
      return res.status(404).send(i18next.t('common.errors.dataNotFound'));

    // Insert records if authorized
    return await insertRecords(res, file, form, resource.fields, req.context);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/**
 * Upload a list of records for a resource in json format
 */
router.post('/resource/insert', async (req: any, res) => {
  try {
    const authToken = req.headers.authorization.split(' ')[1];
    const decodedToken = jwtDecode(authToken) as any;

    // Block if connected with user to Service
    if (!decodedToken.email && !decodedToken.name) {
      const insertRecordsMessage = await insertRecordsPulljob(
        req.body.records,
        req.body.parameters,
        true,
        true
      );
      return res.status(200).send(insertRecordsMessage);
    }
    return res.status(400).send(req.t('common.errors.permissionNotGranted'));
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/**
 * Import a list of users for an application from an uploaded xlsx file
 */
router.post('/application/:id/invite', async (req: any, res) => {
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    // Get the file from request
    const file = req.files.excelFile;
    // Check file size
    if (file.size > FILE_SIZE_LIMIT)
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    // Check file extension (only allowed .xlsx)
    if (file.name.match(/\.[0-9a-z]+$/i)[0] !== '.xlsx')
      return res
        .status(400)
        .send(i18next.t('common.errors.fileExtensionNotAllowed'));

    const roles = await Role.find({ application: req.params.id }).select(
      'id title'
    );
    const attributes = await PositionAttributeCategory.find({
      application: req.params.id,
    }).select('id title');
    const workbook = new Workbook();
    const data = [];
    await workbook.xlsx.load(file.data);
    let keys = [];
    const worksheet = workbook.getWorksheet(1);
    worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
      const values = JSON.parse(JSON.stringify(row.values));
      if (rowNumber === 1) {
        keys = values;
      } else {
        const rawUser: any = {};
        keys.forEach((key, index) => {
          rawUser[`${key}`] = values[index];
        });
        const user = {
          email: '',
          role: [],
          positionAttributes: [],
        };
        if (rawUser.email && rawUser.role) {
          user.email = rawUser.email.text || rawUser.email;
          user.role = roles.find((x) => x.title === rawUser.role)._id || null;
          for (const attr of attributes) {
            const value = rawUser[attr.title] || null;
            user.positionAttributes.push({
              value,
              category: attr._id,
            });
          }
        } else {
          return res
            .status(400)
            .send(i18next.t('routes.upload.errors.invalidUserUpload'));
        }
        data.push(user);
      }
    });
    return res.status(200).send(data);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/**
 * Import a list of users for the platform from an uploaded xlsx file
 */
router.post('/invite', async (req: any, res) => {
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    // Get the file from request
    const file = req.files.excelFile;
    // Check file size
    if (file.size > FILE_SIZE_LIMIT)
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    // Check file extension (only allowed .xlsx)
    if (file.name.match(/\.[0-9a-z]+$/i)[0] !== '.xlsx')
      return res
        .status(400)
        .send(i18next.t('common.errors.fileExtensionNotAllowed'));

    const roles = await Role.find({ application: null }).select('id title');
    const workbook = new Workbook();
    const data = [];
    await workbook.xlsx.load(file.data);
    let keys = [];
    const worksheet = workbook.getWorksheet(1);
    worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
      const values = JSON.parse(JSON.stringify(row.values));
      if (rowNumber === 1) {
        keys = values;
      } else {
        const rawUser: any = {};
        keys.forEach((key, index) => {
          rawUser[`${key}`] = values[index];
        });
        const user = {
          email: '',
          role: [],
          positionAttributes: [],
        };
        if (rawUser.email && rawUser.role) {
          user.email = rawUser.email.text || rawUser.email;
          user.role = roles.find((x) => x.title === rawUser.role)._id || null;
        } else {
          return res
            .status(400)
            .send(i18next.t('routes.upload.errors.invalidUserUpload'));
        }
        data.push(user);
      }
    });
    return res.status(200).send(data);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/** Uploads file from a certain form to azure storage */
router.post('/file/:form', async (req, res) => {
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    const file = Array.isArray(req.files.file)
      ? req.files.file[0]
      : req.files.file;

    // Check file size
    if (file.size > FILE_SIZE_LIMIT) {
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    }

    // Check form
    const formID = req.params.form;
    const form = await Form.exists({ _id: formID });
    if (!form) {
      return res.status(404).send(i18next.t('common.errors.dataNotFound'));
    }
    const path = await uploadFile('forms', formID, file);
    return res.status(200).send({ path });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/** Uploads stylesheet file of a specified application to azure storage */
router.post('/style/:application', async (req, res) => {
  const context = req.context;
  try {
    // Check file
    if (!req.files || Object.keys(req.files).length === 0)
      return res
        .status(400)
        .send(i18next.t('routes.upload.errors.missingFile'));
    const file = Array.isArray(req.files.file)
      ? req.files.file[0]
      : req.files.file;

    // Check file size
    if (file.size > FILE_SIZE_LIMIT) {
      return res
        .status(400)
        .send(i18next.t('common.errors.fileSizeLimitReached'));
    }
    // Authentication check
    // todo: check if useless
    const user = context.user;
    if (!user) {
      return res.status(401).send(i18next.t('common.errors.userNotLogged'));
    }
    const ability: AppAbility = context.user.ability;
    const filters = Application.find(
      accessibleBy(ability, 'update').Application
    )
      .where({ _id: req.params.application })
      .getFilter();

    const application = await Application.findOne(filters);
    if (!application) {
      return res
        .status(403)
        .send(i18next.t('common.errors.permissionNotGranted'));
    }
    const path = await uploadFile(
      'applications',
      req.params.application,
      file,
      {
        filename: application.cssFilename,
        allowedExtensions: ['css', 'scss'],
      }
    );

    await Application.updateOne(
      { _id: req.params.application },
      { cssFilename: path }
    );

    return res.status(200).send({ path });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

export default router;
