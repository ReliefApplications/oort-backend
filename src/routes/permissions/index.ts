import express from 'express';
import config from 'config';
import { logger } from '@lib/logger';
import { Record, ReferenceData } from '@models';
import mongoose from 'mongoose';

/**
 * Routes for permissions
 */
const router = express.Router();

/** Return configuration of permissions */
router.get('/configuration', async (req: any, res) => {
  try {
    const data = {
      groups: {
        local: config.get('user.groups.local'),
      },
      attributes: {
        local: config.get('user.attributes.local'),
      },
    };
    return res.status(200).send(data);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/** Return available attributes */
router.get('/attributes', async (req: any, res) => {
  try {
    const data = config.get('user.attributes.list') || [];
    return res.status(200).send(data);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

/** Return available attributes */
router.get('/attributes/:value/choices', async (req: any, res) => {
  try {
    const attributes: any[] = config.get('user.attributes.list') || [];
    const attribute = attributes.find(
      (attr: any) => attr.value === req.params.value
    );
    if (!attribute) {
      return res.status(404).send(req.t('common.errors.dataNotFound'));
    }
    if (!attribute.resource && !attribute.referenceData) {
      return res
        .status(400)
        .send(req.t('routes.permissions.attributes.errors.cannotFetchChoices'));
    }
    if (attribute.referenceData) {
      const referenceData = await ReferenceData.findById(
        new mongoose.Types.ObjectId(attribute.referenceData)
      );
      if (referenceData && referenceData?.type === 'static') {
        const valueKey = attribute.valueField || 'value';
        const textKey = attribute.textField || 'text';

        const choices = referenceData.data.map((item: any) => ({
          value: item[valueKey],
          text: item[textKey],
        }));
        return res.status(200).send(choices);
      } else {
        return res
          .status(400)
          .send(
            req.t('routes.permissions.attributes.errors.cannotFetchChoices')
          );
      }
    }
    if (attribute.resource) {
      const records = await Record.find({
        resource: new mongoose.Types.ObjectId(attribute.resource),
        archived: { $ne: true },
      }).select(`_id data.${attribute.textField}`);
      const textKey = attribute.textField || 'text';
      const choices = records.map((record: any) => ({
        value: record._id.toString(),
        text: record.data?.[textKey] || '',
      }));
      return res.status(200).send(choices);
    }
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

export default router;
