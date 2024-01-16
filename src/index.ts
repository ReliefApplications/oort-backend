import { SafeServer } from './server';
import mongoose from 'mongoose';
import subscriberSafe from './server/subscriberSafe';
import pullJobScheduler from './server/pullJobScheduler';
import customNotificationScheduler from './server/customNotificationScheduler';
import { startDatabase } from './server/database';
import config from 'config';
import { logger } from './services/logger.service';
import { checkConfig } from '@utils/server/checkConfig.util';
import buildSchema from '@utils/schema/buildSchema';
import { CronJob } from 'cron';
import { Record, Resource, User } from '@models';

// Needed for survey.model, as xmlhttprequest is not defined in servers
global.XMLHttpRequest = require('xhr2');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    /** Express request interface definition */
    interface Request {
      context: any;
    }
  }
}

// Ensure that all mandatory keys exist
checkConfig();

/** SafeServer server port */
const PORT = config.get('server.port');

startDatabase();
mongoose.connection.once('open', () => {
  logger.log({ level: 'info', message: '📶 Connected to database' });
  subscriberSafe();
  pullJobScheduler();
  customNotificationScheduler();
});

/** Starts the server */
const launchServer = async () => {
  const schema = await buildSchema();
  const safeServer = new SafeServer();
  await safeServer.start(schema);
  safeServer.httpServer.listen(PORT, () => {
    logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`🚀 Server ready at ws://localhost:${PORT}/graphql`);
  });
  safeServer.status.on('ready', () => {
    safeServer.httpServer.listen(PORT, () => {
      logger.info(`🚀 Server ready at http://localhost:${PORT}/graphql`);
      logger.info(`🚀 Server ready at ws://localhost:${PORT}/graphql`);
    });
  });
};

// Cron job to run every week
new CronJob(
  // '0 * * * * *', // Runs every minute
  '0 0 * * 0', // Runs every week
  () => {
    (async function clearDataGDPR() {
      const IS_ALIMENTAIDE =
        config.get('server.url') ===
        'https://alimentaide-973-guyane.oortcloud.tech/api';

      // Check if the server is GUYANE
      if (!IS_ALIMENTAIDE) {
        return;
      }

      // Get all users with lastLogin 6 months ago
      const usersToDelete = await User.find({
        lastLogin: { $lt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }, // 6 months ago
      });

      // Find the resource with name staff
      const staff = await Resource.findOne({ name: 'Staff' });

      // Find all the records of staff with the users found above
      const usersStaffRecords = await Record.find({
        resource: staff._id,
        user: { $in: usersToDelete.map((user) => user._id) },
      });

      // Hiding the info both on the user and their staff record
      // username/email:  [RANDOM STRING]@anonymus-oort.com
      // name: [ANONYMOUS]

      // Hide the info on the user
      for (let i = 0; i < usersToDelete.length; i++) {
        const user = usersToDelete[i];

        // Update the user
        user.username = `${Math.random()
          .toString(36)
          .substring(2, 15)}@anonymus-oort.com`;
        user.firstName = 'ANONYMOUS';
        user.lastName = 'ANONYMOUS';
        user.name = 'ANONYMOUS';
        user.roles = [];

        await user.save();
      }

      // Hide the info on the staff record
      for (let i = 0; i < usersStaffRecords.length; i++) {
        const staffRecord = usersStaffRecords[i];

        // Update the staff record
        staffRecord._createdBy = new User({
          name: 'ANONYMOUS',
          username: `${Math.random()
            .toString(36)
            .substring(2, 15)}@anonymus-oort.com`,
        });
        staffRecord.data.nom_employes = 'ANONYMOUS';
        staffRecord.data.prenom_employes = 'ANONYMOUS';
        staffRecord.data.nom_prenom_employes = 'ANONYMOUS';
        staffRecord.data.tel_staff = 'ANONYMOUS';
        staffRecord.data.email_staff = 'ANONYMOUS';
        staffRecord.data.birthdate_employes = 'ANONYMOUS';
        staffRecord._lastUpdatedBy = new User({
          name: 'ANONYMOUS',
          username: `${Math.random()
            .toString(36)
            .substring(2, 15)}@anonymus-oort.com`,
        });
        staffRecord.data.file_gdpr_staff = [];

        await staffRecord.save();
      }

      // For the beneficiaries
      // Trigger when: The last aid to the family was given more than 18 months ago
      // Than: Anonymize all members of that family

      // Find the resource with name Aid
      const Aid = await Resource.findOne({ name: 'Aid' });

      // Find all the records of Ais was given more than 18 months ago
      const AidRecords = await Record.find({
        resource: Aid._id,
        createdAt: {
          $lt: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000),
        }, // 18 months ago
      });

      // Anonymize all members of that family
      for (let i = 0; i < AidRecords.length; i++) {
        const aidRecord = AidRecords[i];

        // Get Family record
        const familyRecord = await Record.findOne({
          _id: aidRecord?.data?.owner_resource,
        });

        // Find all members of the family
        const members = await Record.find({
          _id: { $in: familyRecord?.data?.members },
        });

        // Anonymize all members of that family
        for (let j = 0; j < members.length; j++) {
          const member = members[j];

          // Anonymize the member
          member._createdBy = new User({
            name: 'ANONYMOUS',
            username: `${Math.random()
              .toString(36)
              .substring(2, 15)}@anonymus-oort.com`,
          });
          member.data.location = 'ANONYMOUS';
          member.data.surname = 'ANONYMOUS';
          member.data.firstname = 'ANONYMOUS';
          member.data.phone = 'ANONYMOUS';
          member.data.nom_employes = 'ANONYMOUS';
          member.data.gender = 'ANONYMOUS';
          member.data.birthdate = 'ANONYMOUS';
          member.data.prenom_employes = 'ANONYMOUS';
          member.data.nom_prenom_employes = 'ANONYMOUS';
          member.data.tel_staff = 'ANONYMOUS';
          member.data.email_staff = 'ANONYMOUS';
          member.data.birthdate_employes = 'ANONYMOUS';
          member._lastUpdatedBy = new User({
            name: 'ANONYMOUS',
            username: `${Math.random()
              .toString(36)
              .substring(2, 15)}@anonymus-oort.com`,
          });
          member.data.file_gdpr_staff = [];

          await member.save();
        }
      }
    })();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
).start();

launchServer();
