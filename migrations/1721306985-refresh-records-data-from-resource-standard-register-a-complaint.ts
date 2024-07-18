/* eslint-disable @typescript-eslint/naming-convention */
import { Record } from '@models';
import { startDatabaseForMigration } from '../src/utils/migrations/database.helper';

/**
 * Sample function of up migration
 *
 * @returns just migrate data.
 */
export const up = async () => {
  await startDatabaseForMigration();

  await Record.updateMany(
    {
      resource: '642c00b46fc5b0622991aa8d',
      $or: [
        { 'data.status': { $ne: null } },
        { 'data.migrant_status': { $ne: null } },
        { 'data.gender': { $ne: null } },
        { 'data.comp_from': { $ne: null } },
        { 'data.fatality': { $ne: null } },
        { 'data.incapacity': { $ne: null } },
        { 'data.p_gender': { $ne: null } },
        { 'data.compl_type': { $ne: null } },
        { 'data.list_checklists': { $ne: null } },
        { 'data.gen_labour_standards': { $ne: null } },
        { 'data.event_type': { $ne: null } },
      ],
    },
    [
      {
        $set: {
          'data.status': {
            $cond: {
              if: { $ne: ['$data.status', null] },
              then: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$data.status', '1'] }, then: 'worker' },
                    { case: { $eq: ['$data.status', '2'] }, then: 'orga' },
                    { case: { $eq: ['$data.status', '3'] }, then: 'public' },
                    { case: { $eq: ['$data.status', '4'] }, then: 'employer' },
                    { case: { $eq: ['$data.status', '5'] }, then: 'gov' },
                    {
                      case: { $eq: ['$data.status', '6'] },
                      then: 'institution',
                    },
                  ],
                  default: '$data.status', // Record already has the updated value saved
                },
              },
              else: '$data.status', // Keep the same value if field is null
            },
          },
          'data.migrant_status': {
            $cond: {
              if: { $ne: ['$data.migrant_status', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$data.migrant_status', '1'] },
                      then: 'int',
                    },
                    {
                      case: { $eq: ['$data.migrant_status', '2'] },
                      then: 'ext',
                    },
                  ],
                  default: '$data.migrant_status', // Record already has the updated value saved
                },
              },
              else: '$data.migrant_status', // Keep the same value if field is null
            },
          },
          'data.gender': {
            $cond: {
              if: { $ne: ['$data.gender', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$data.gender', '1'] },
                      then: 'male',
                    },
                    {
                      case: { $eq: ['$data.gender', '2'] },
                      then: 'female',
                    },
                    {
                      case: { $eq: ['$data.gender', '3'] },
                      then: 'other',
                    },
                  ],
                  default: '$data.gender', // Record already has the updated value saved
                },
              },
              else: '$data.gender', // Keep the same value if field is null
            },
          },
          'data.comp_from': {
            $cond: {
              if: { $ne: ['$data.comp_from', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$data.comp_from', '1'] },
                      then: 'phone',
                    },
                    {
                      case: { $eq: ['$data.comp_from', '2'] },
                      then: 'visit',
                    },
                    {
                      case: { $eq: ['$data.comp_from', '3'] },
                      then: 'web',
                    },
                  ],
                  default: '$data.comp_from', // Record already has the updated value saved
                },
              },
              else: '$data.comp_from', // Keep the same value if field is null
            },
          },
          'data.fatality': {
            $cond: {
              if: { $ne: ['$data.fatality', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$data.fatality', 'Item 1'] },
                      then: 'fatal',
                    },
                    {
                      case: { $eq: ['$data.fatality', 'Item 2'] },
                      then: 'non_fatal',
                    },
                  ],
                  default: '$data.fatality', // Record already has the updated value saved
                },
              },
              else: '$data.fatality', // Keep the same value if field is null
            },
          },
          'data.incapacity': {
            $cond: {
              if: { $ne: ['$data.incapacity', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: [
                          '$data.incapacity',
                          'Temporary incapacity to work',
                        ],
                      },
                      then: 'temporary',
                    },
                    {
                      case: {
                        $eq: [
                          '$data.incapacity',
                          'Permanent incapacity to work',
                        ],
                      },
                      then: 'permanent',
                    },
                  ],
                  default: '$data.incapacity', // Record already has the updated value saved
                },
              },
              else: '$data.incapacity', // Keep the same value if field is null
            },
          },
          'data.p_gender': {
            $cond: {
              if: { $ne: ['$data.p_gender', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: ['$data.p_gender', '1'],
                      },
                      then: 'male',
                    },
                    {
                      case: {
                        $eq: ['$data.p_gender', '2'],
                      },
                      then: 'female',
                    },
                  ],
                  default: '$data.p_gender', // Record already has the updated value saved
                },
              },
              else: '$data.p_gender', // Keep the same value if field is null
            },
          },
          'data.compl_type': {
            $cond: {
              if: { $ne: ['$data.compl_type', null] },
              then: {
                $cond: {
                  if: { $eq: [{ $type: '$data.compl_type' }, 'array'] },
                  // If value saved is an array
                  then: {
                    $map: {
                      input: '$data.compl_type',
                      as: 'compl',
                      in: {
                        $switch: {
                          branches: [
                            { case: { $eq: ['$$compl', '1'] }, then: 'gls' },
                            {
                              case: { $eq: ['$$compl', '2'] },
                              then: 'osh_notif',
                            },
                            {
                              case: { $eq: ['$$compl', '3'] },
                              then: 'osh_gen',
                            },
                            { case: { $eq: ['$$compl', '4'] }, then: 'ss' },
                          ],
                          default: '$$compl', // Keep the same value if none of the branches match
                        },
                      },
                    },
                  },
                  else: {
                    // If value saved is an string
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ['$data.compl_type', '1'] },
                          then: 'gls',
                        },
                        {
                          case: { $eq: ['$data.compl_type', '2'] },
                          then: 'osh_notif',
                        },
                        {
                          case: { $eq: ['$data.compl_type', '3'] },
                          then: 'osh_gen',
                        },
                        {
                          case: { $eq: ['$data.compl_type', '4'] },
                          then: 'ss',
                        },
                      ],
                      default: '$data.compl_type', // Keep the same value if none of the branches match
                    },
                  },
                },
              },
              else: '$data.compl_type', // Keep the same value if field is null
            },
          },
          'data.list_checklists': {
            $cond: {
              if: { $ne: ['$data.list_checklists', null] },
              then: {
                $map: {
                  input: '$data.list_checklists',
                  as: 'compl',
                  in: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$$compl', '1'] }, then: 'gls' },
                        { case: { $eq: ['$$compl', '2'] }, then: 'osh_notif' },
                        { case: { $eq: ['$$compl', '3'] }, then: 'osh_gen' },
                        { case: { $eq: ['$$compl', '4'] }, then: 'ss' },
                      ],
                      default: '$$compl', // Keep the same value if none of the branches match
                    },
                  },
                },
              },
              else: '$data.list_checklists', // Keep the same value if field is null
            },
          },
          'data.gen_labour_standards': {
            $cond: {
              if: { $ne: ['$data.gen_labour_standards', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: ['$data.gen_labour_standards', 'Wages'],
                      },
                      then: 'wage',
                    },
                    {
                      case: {
                        $eq: ['$data.gen_labour_standards', 'Discrimination'],
                      },
                      then: 'discr',
                    },
                    {
                      case: {
                        $eq: ['$data.gen_labour_standards', 'Child Labour'],
                      },
                      then: 'child',
                    },
                    {
                      case: {
                        $eq: ['$data.gen_labour_standards', 'Forced labour'],
                      },
                      then: 'forced',
                    },
                    {
                      case: {
                        $eq: [
                          '$data.gen_labour_standards',
                          'Maternity protection',
                        ],
                      },
                      then: 'meternity',
                    },
                    {
                      case: {
                        $eq: ['$data.gen_labour_standards', 'Working time'],
                      },
                      then: 'time',
                    },
                    {
                      case: {
                        $eq: [
                          '$data.gen_labour_standards',
                          'Employment relationship',
                        ],
                      },
                      then: 'relationship',
                    },
                  ],
                  default: '$data.gen_labour_standards', // Record already has the updated value saved
                },
              },
              else: '$data.gen_labour_standards', // Keep the same value if field is null
            },
          },
          'data.event_type': {
            $cond: {
              if: { $ne: ['$data.event_type', null] },
              then: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $eq: ['$data.event_type', 'Dangerous occurence'],
                      },
                      then: 'dang_occ',
                    },
                    {
                      case: {
                        $eq: ['$data.event_type', 'Accident/ Injury'],
                      },
                      then: 'accident',
                    },
                    {
                      case: {
                        $eq: [
                          '$data.event_type',
                          'Disease or suspected disease',
                        ],
                      },
                      then: 'disease',
                    },
                    {
                      case: {
                        $eq: ['$data.event_type', '1'],
                      },
                      then: 'dang_occ',
                    },
                    {
                      case: {
                        $eq: ['$data.event_type', '2'],
                      },
                      then: 'accident',
                    },
                    {
                      case: {
                        $eq: ['$data.event_type', '3'],
                      },
                      then: 'disease',
                    },
                  ],
                  default: '$data.event_type', // Record already has the updated value saved
                },
              },
              else: '$data.event_type', // Keep the same value if field is null
            },
          },
        },
      },
    ]
  );
};

/**
 * Sample function of down migration
 *
 * @returns just migrate data.
 */
export const down = async () => {
  /*
      Code you downgrade script here!
   */
};
