import { Application, User } from '@models';
import { sendEmail } from '../email';
import config from 'config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

type InvitationLocals = {
  senderName: string;
  appName?: string;
  url?: URL;
  registerUrl: URL;
  logoUrl: string;
};

type LogoAttachment = {
  filename: string;
  content: string;
  encoding: 'base64';
  cid: string;
  contentType: string;
  contentDisposition: 'inline';
};

/**
 * Loads the UNESCO logo as an inline attachment for email clients
 *
 * @returns The attachment definition for the UNESCO logo
 */
const getUnescoLogoAttachment = (): LogoAttachment => {
  const logoPath = resolve(
    process.cwd(),
    'src/assets/emails/images/logo-blue.png'
  );
  const pngContent = readFileSync(logoPath);
  return {
    filename: 'logo-blue.png',
    content: pngContent.toString('base64'),
    encoding: 'base64',
    cid: 'unesco-logo',
    contentType: 'image/png',
    contentDisposition: 'inline',
  };
};

/**
 * Build the register URL used in invitation emails.
 *
 * @param redirectUri The redirect URI after registration
 * @returns The registration URL
 */
const buildRegisterUrl = (redirectUri: string | URL): URL => {
  const authBase = config.get('auth.url').toString();
  const authRealm = config.get('auth.realm').toString();
  const authClientId = config.get('auth.clientId').toString();
  return new URL(
    `${authBase}/realms/${authRealm}/protocol/openid-connect/registrations?client_id=${authClientId}&scope=openid%20profile&redirect_uri=${redirectUri}&response_type=code`
  );
};

/**
 * Resolve a sender name to display in the email.
 *
 * @param sender The user who sends the invitation
 * @returns The sender name to use in the template
 */
const resolveSenderName = (sender: User): string => {
  const directName = sender.name?.trim();
  if (directName) {
    return directName;
  }
  const composedName = [sender.firstName, sender.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (composedName) {
    return composedName;
  }
  return sender.username || 'MAB Secretariat';
};

/**
 * Send invitation emails individually to avoid exposing recipients.
 *
 * @param recipients The list of recipients for the mail
 * @param template The email template to use
 * @param locals The locals passed to the template
 * @param attachments Optional attachments to include in the email
 */
const sendInvitationEmails = async (
  recipients: string[],
  template: string,
  locals: InvitationLocals,
  attachments?: LogoAttachment[]
): Promise<void> => {
  for (const recipient of recipients) {
    try {
      await sendEmail({
        template,
        message: {
          to: [recipient],
          attachments,
        },
        locals: { ...locals },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to send ${template} invitation to ${recipient}: ${errorMessage}`
      );
    }
  }
};

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
  const senderName = resolveSenderName(sender);
  const registerUrl = buildRegisterUrl(url);
  const logoAttachment = getUnescoLogoAttachment();

  await sendInvitationEmails(
    recipients,
    'app-invitation',
    {
      senderName,
      appName: application.name,
      url,
      registerUrl,
      logoUrl: `cid:${logoAttachment.cid}`,
    },
    [logoAttachment]
  );
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
  const senderName = resolveSenderName(sender);

  if (application) {
    const url = new URL(config.get('frontOffice.uri'));
    url.pathname = `/${application.id}`;
    const registerUrl = buildRegisterUrl(url);
    const logoAttachment = getUnescoLogoAttachment();
    await sendInvitationEmails(
      recipients,
      'create-account-to-app',
      {
        senderName,
        appName: application.name,
        url,
        registerUrl,
        logoUrl: `cid:${logoAttachment.cid}`,
      },
      [logoAttachment]
    );
    return;
  }

  const registerUrl = buildRegisterUrl(
    config.get('backOffice.uri').toString().slice(0, -1)
  );
  const logoAttachment = getUnescoLogoAttachment();
  await sendInvitationEmails(
    recipients,
    'create-account',
    {
      senderName,
      registerUrl,
      logoUrl: `cid:${logoAttachment.cid}`,
    },
    [logoAttachment]
  );
};
