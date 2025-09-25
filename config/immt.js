/**
 * Configuration of back-office
 * Use https://www.npmjs.com/package/config package.
 */
module.exports = {
  email: {
    sendInvite: true,
  },
  user: {
    groups: {
      local: true,
    },
    attributes: {
      local: false,
      list: [
        {
          value: 'unescoSector',
          text: 'Unesco Sector/Division',
        },
        {
          value: 'unescoMajorProgramme',
          text: 'Unesco Major Programme',
        },
      ],
      apiConfiguration: '68cabe3a2cff3a4806cf9c8c',
      endpoint: '?$select=department',
      mapping: [
        {
          field: 'attributes.unescoSector',
          value: 'department',
        },
      ],
    },
  },
};
