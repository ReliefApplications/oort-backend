import { CronJob } from 'cron';
import { anonymizeStaff } from './anonymizeStaff';
import { logger } from '@services/logger.service';
import config from 'config';

/** All available jobs */
const JOBS: {
  name: string;
  description: string;
  fn: () => Promise<void>;
  // Schedule in cron format
  schedule: string;
  // Environments where the job should be started
  envs: string[];
}[] = [
  {
    name: 'Anonymize staff',
    description: "Anonymizes staff, if didn't log in for more than 6 months",
    // Every week
    schedule: '0 0 * * 0',
    fn: anonymizeStaff,
    envs: ['alimentaide'],
  },
];

/** Starts all the jobs */
export const startJobs = () => {
  const isDev = config.util.getEnv('NODE_ENV') === 'development';
  const env = config.util.getEnv('NODE_CONFIG_ENV');

  // Start all the jobs
  JOBS.forEach((job) => {
    // Check if the job should be started
    if (!isDev && !job.envs.includes(env)) {
      return;
    }

    // Start the job
    new CronJob(
      job.schedule,
      async () => {
        try {
          await job.fn();
        } catch (error) {
          console.error(error);
        }
      },
      null,
      true
    ).start();

    logger.info(`🤖 Job "${job.name}" started`);
  });
};
