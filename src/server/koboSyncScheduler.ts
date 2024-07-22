import { Form } from '@models';
import { logger } from '../services/logger.service';
import { CronJob } from 'cron';
import { get } from 'lodash';
import * as cronValidator from 'cron-validator';
import { addRecordsFromKobo } from '@utils/form/kobo/addRecordsFromKobo';

/** A map with the task ids as keys and the scheduled tasks as values */
const taskMap: Record<string, CronJob> = {};

/**
 * Global function called on server start to initialize all the pullJobs.
 */
const koboSyncScheduler = async () => {
  const forms = await Form.find({
    $and: [
      { 'kobo.cronSchedule': { $ne: null } },
      { 'kobo.cronSchedule': { $ne: '' } },
    ],
  }).populate({
    path: 'kobo.apiConfiguration',
    model: 'ApiConfiguration',
  });
  for (const form of forms) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    scheduleKoboSync(form);
  }
};

export default koboSyncScheduler;

/**
 * Schedule or re-schedule the synchronization of the kobo data submissions for a form.
 *
 * @param form form to schedule records data synchronization
 */
export const scheduleKoboSync = (form: Form) => {
  console.log('form: ', form.name);
  try {
    const task = taskMap[form.id];
    if (task) {
      task.stop();
    }
    const schedule = get(form, 'kobo.cronSchedule', '');
    if (cronValidator.isValidCron(schedule)) {
      taskMap[form.id] = new CronJob(
        form.kobo.cronSchedule,
        async () => {
          // call addRecordsFromKobo.mutation
          try {
            const addedRecords = await addRecordsFromKobo(
              form,
              form.kobo.apiConfiguration
            );
            console.log('addedRecords: ', addedRecords);

            if (addedRecords) {
              logger.info(
                '📅 Imported Kobo data on scheduled synchronization for form: ' +
                  form.name
              );
            } else {
              logger.info(
                '📅 Nothing to import from Kobo on scheduled synchronization for form: ' +
                  form.name
              );
            }
          } catch (error) {
            logger.info(
              '📅 Error on trying to import Kobo data on scheduled synchronization for form "' +
                form.name +
                '". Error: ' +
                error
            );
          }
        },
        null,
        true
      );
      logger.info(
        '📅 Scheduled Kobo entries synchronization for form: ' + form.name
      );
    } else {
      throw new Error(`[${form.name}] Invalid schedule: ${schedule}`);
    }
  } catch (err) {
    logger.error(err.message);
  }
};

/**
 * Unschedule an existing kobo form schedule synchronization from its id.
 *
 * @param form form to unschedule
 */
export const unscheduleKoboSync = (form: Form): void => {
  const task = taskMap[form.id];
  if (task) {
    task.stop();
    logger.info(
      `📆 Unscheduled synchronization from Kobo of the form  ${
        form.name ? form.name : form.id
      }`
    );
  }
};
