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
          valueField: 'iso3_code',
          userCanEdit: true,
          includeInTemplate: true,
          showInList: true,
        },
        {
          value: 'jobTitle',
          text: 'Job Title',
          userCanEdit: true,
        },
        {
          value: '_can_edit_brs',
          text: 'Editable BRs',
          userCanEdit: false,
          type: 'array',
          showInList: true,
          includeInTemplate: true,
          referenceData: '682e1d63839fa743ca474aa0',
          textField: 'a_01_1_name_in_english',
          valueField: '_id',
        },
        {
          value: '_can_view_brs',
          text: 'Viewable BRs',
          userCanEdit: false,
          type: 'array',
        },
      ],
    },
  },
  admin0: {
    referenceData: '67605fdc851e937cd9b21be8',
  },
};
