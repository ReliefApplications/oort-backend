/**
 * Configuration of back-office
 * Use https://www.npmjs.com/package/config package.
 */
module.exports = {
  email: {
    sendInvite: true,
  },
  user: {
    attributes: {
      local: true,
      list: [
        {
          value: 'country',
          text: 'Country',
          referenceData: '67605fdc851e937cd9b21be8',
          textField: 'name',
          userCanEdit: true,
        },
        {
          value: 'jobTitle',
          text: 'Job Title',
          userCanEdit: true,
        },
      ],
    },
  },
};
