/**
 * Configuration of back-office
 * Use https://www.npmjs.com/package/config package.
 */
module.exports = {
  email: {
    sendInvite: true,
  },
  user: {
    invitationExpiryDays: 14,
    groups: {
      local: true,
    },
    attributes: {
      local: true,
    },
  },
};
