import express from 'express';
import { Application } from '@models';
import { logger } from '@lib/logger';
import extendAbilityForApplications from '@security/extendAbilityForApplication';
import { AppAbility } from '@security/defineUserAbility';
import config from 'config';
import { isValidObjectId } from 'mongoose';

/**
 * Routes for notifications / triggers
 */
const router = express.Router();

/**
 * List triggers for a given application.
 *
 *  @param application application id (required)
 *  @param page page index (optional, default 0)
 *  @param pageSize items per page (optional, default 10)
 *  @param search optional case-insensitive filter on trigger name
 *  @param startDate optional ISO date string, filters createdAt >= startDate
 *  @param endDate optional ISO date string, filters createdAt <= endDate
 *  @returns An object containing the list of triggers, total count, page, and page size
 */
router.get('/triggers', async (req: any, res) => {
  try {
    const applicationId = req.query.application as string;
    if (!applicationId || isValidObjectId(applicationId) === false) {
      return res.status(400).send(req.t('common.errors.badRequest'));
    }

    const page = Number.isNaN(Number(req.query.page))
      ? 0
      : Number(req.query.page);
    const pageSizeQuery = Number(req.query.pageSize);
    const maxPaginationLimit: number = config.get('server.pagination.limit');
    const pageSize =
      !Number.isNaN(pageSizeQuery) && pageSizeQuery > 0
        ? Math.min(pageSizeQuery, maxPaginationLimit)
        : Math.min(10, maxPaginationLimit);

    const search = (req.query.search as string) || '';
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : null;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : null;

    // Ability check
    const user = req.context.user;
    const ability: AppAbility = extendAbilityForApplications(
      user,
      applicationId
    );
    if (ability.cannot('read', 'CustomNotification')) {
      return res.status(403).send(req.t('common.errors.permissionNotGranted'));
    }

    const application = await Application.findById(applicationId).select(
      'customNotifications'
    );
    if (!application) {
      return res.status(404).send(req.t('common.errors.dataNotFound'));
    }

    let notifications = (application.customNotifications || []).filter(
      (notification: any) => notification.applicationTrigger === true
    );

    if (search) {
      const lowered = search.toLowerCase();
      notifications = notifications.filter((n) =>
        (n.name || '').toLowerCase().includes(lowered)
      );
    }

    if (startDate) {
      notifications = notifications.filter(
        (n) => n.createdAt && new Date(n.createdAt) >= startDate
      );
    }

    if (endDate) {
      notifications = notifications.filter(
        (n) => n.createdAt && new Date(n.createdAt) <= endDate
      );
    }

    // Sort by name ascending
    notifications = notifications.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    const totalCount = notifications.length;
    const safePage = page >= 0 ? page : 0;
    const start = safePage * pageSize;
    const end = start + pageSize;
    const items = notifications.slice(start, end);

    return res.status(200).send({
      items,
      totalCount,
      page: safePage,
      pageSize,
    });
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res.status(500).send(req.t('common.errors.internalServerError'));
  }
});

export default router;
