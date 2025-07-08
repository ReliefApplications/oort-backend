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
          text: 'Unesco sector',
        },
      ],
      apiConfiguration: '',
      endpoint: '',
      mapping: [
        {
          field: 'attributes.unescoSector',
          value: '',
        },
      ],
    },
  },
};
