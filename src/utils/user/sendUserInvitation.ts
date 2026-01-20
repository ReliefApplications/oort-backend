import { Application, User } from '@models';
import { sendEmail } from '../email';
import config from 'config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Loads the UNESCO logo and converts it to a data URL for embedding in emails
 */
const getUnescoLogoDataUrl = (): string => {
  const logoPath = resolve(__dirname, '../../assets/emails/images/logo-blue.svg');
  const svgContent = readFileSync(logoPath, 'utf-8');
  const base64 = Buffer.from(svgContent).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
};

// Cache the logo data URL to avoid reading the file multiple times
const UNESCO_LOGO_DATA_URL = getUnescoLogoDataUrl();

/**
 * Send a mail with the invitation link to the application
 *
 * @param recipients The list of recipients for the mail
 * @param sender The user who send the invitation
 * @param application The id of the application
 */
export const sendAppInvitation = async (
  recipients: string[],
  sender: User,
  application: Application
) => {
  const url = new URL(config.get('frontOffice.uri'));
  url.pathname = `/${application.id}`;
  
  // Send individual emails to each recipient for privacy
  for (const recipient of recipients) {
    await sendEmail({
      template: 'app-invitation',
      message: {
        to: [recipient],
      },
      locals: {
        senderName: 'MAB Secretariat',
        appName: application.name,
        url,
        logoUrl: UNESCO_LOGO_DATA_URL,
      },
    });
  }
};

/**
 * Send a mail with the invitation link to the application
 *
 * @param recipients The list of recipients for the mail
 * @param sender The user who send the invitation
 * @param application The id of the application
 */
export const sendCreateAccountInvitation = async (
  recipients: string[],
  sender: User,
  application: Application | null
) => {
  // Send individual emails to each recipient for privacy
  for (const recipient of recipients) {
    if (application) {
      const url = new URL(config.get('frontOffice.uri'));
      url.pathname = `/${application.id}`;
      await sendEmail({
        template: 'create-account-to-app',
        message: {
          to: [recipient],
        },
        locals: {
          senderName: 'MAB Secretariat',
          appName: application.name,
          url,
          logoUrl: UNESCO_LOGO_DATA_URL,
          registerUrl: new URL(
            config.get('auth.url').toString() +
              '/realms/' +
              config.get('auth.realm').toString() +
              '/protocol/openid-connect/registrations?client_id=' +
              config.get('auth.clientId').toString() +
              '&scope=openid%20profile&redirect_uri=' +
              url +
              '&response_type=code'
          ),
        },
      });
    } else {
      await sendEmail({
        template: 'create-account',
        message: {
          to: [recipient],
        },
        locals: {
          senderName: 'MAB Secretariat',
          url: new URL(
            config.get('auth.url').toString() +
              '/realms/' +
              config.get('auth.realm').toString() +
              '/protocol/openid-connect/registrations?client_id=' +
              config.get('auth.clientId').toString() +
              '&scope=openid%20profile&redirect_uri=' +
              config.get('backOffice.uri').toString().slice(0, -1) +
              '&response_type=code'
          ),
          logoUrl: UNESCO_LOGO_DATA_URL,
        },
      });
    }
  }
};
