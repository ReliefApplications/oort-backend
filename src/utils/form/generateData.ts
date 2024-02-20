import { faker } from '@faker-js/faker';
import { Record, Role, User } from '@models';
/** Generate data for one record */
export const generateData = async (fields: any, form: any) => {
  let data = {};
  const questionsStructure = JSON.parse(form.structure).pages.reduce(
    (acc: any, page: any) => acc.concat(page.elements),
    []
  );
  /** Generate data for one field */
  const _generateFieldData = async (
    questionStructure: any,
    actions: any
  ): Promise<any> => {
    const type = questionStructure.inputType ?? questionStructure.type;
    switch (type) {
      case 'text':
        return faker.lorem.sentence();
      case 'color':
        return faker.internet.color();
      case 'date':
        return (
          new Date(
            faker.date.between(
              actions.minDate ?? '2020-01-01T00:00:00.000Z',
              actions.maxDate ?? '2030-01-01T00:00:00.000Z'
            )
          )
            .toISOString()
            .slice(0, 10) + 'T00:00:00.000Z'
        );
      case 'datetime-local':
        if (actions.maxDate) {
          return new Date(
            faker.date.between(
              actions.minDate ?? '2020-01-01T00:00:00.000Z',
              actions.maxDate + 'T23:59:00.000Z'
            )
          ).toISOString();
        }
        return new Date(
          faker.date.between(
            actions.minDate ?? '2020-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z'
          )
        ).toISOString();
      case 'email':
        return faker.internet.email();
      case 'number':
        return faker.datatype.number({
          min: actions.minNumber ?? 0,
          max: actions.maxNumber ?? 1000,
        });
      case 'tel':
        return faker.phone.number();
      case 'time':
        return (
          '1970-01-01T' +
          new Date(
            faker.date.between(
              actions.minTime ?? '1970-01-01T00:00:00.000Z',
              actions.maxTime ?? '1970-01-01T23:59:00.000Z'
            )
          )
            .toISOString()
            .slice(11, 16) +
          ':00.000Z'
        );
      case 'url':
        return faker.internet.url();
      case 'month':
        return faker.date
          .between('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
          .toISOString()
          .slice(0, 7);
      case 'password':
        return faker.internet.password();
      case 'range':
        return faker.datatype.number({
          min: 0,
          max: 100,
        });
      case 'week':
        return (
          faker.datatype.number({ min: 2000, max: 2030 }) +
          '-W' +
          faker.datatype.number({ min: 1, max: 52 })
        );
      case undefined:
      case 'comment':
        return faker.lorem.paragraph();
      case 'radiogroup':
      case 'dropdown':
        // If the choices are set with values != texts, we only want the values
        // If the choices are set with values == texts, choices is an array of strings
        const questionSingleChoices = questionStructure.choices.map((item) =>
          typeof item === 'object' ? item.value : item
        );
        return questionSingleChoices[
          faker.datatype.number({
            min: 0,
            max: questionSingleChoices.length - 1,
          })
        ];
      case 'tagbox':
      case 'checkbox':
        let choices = [];
        const questionMultipleChoices = questionStructure.choices.map((item) =>
          typeof item === 'object' ? item.value : item
        );
        questionMultipleChoices.forEach((choice: any) => {
          if (faker.datatype.boolean()) {
            choices.push(choice);
          }
        });
        if (choices.length === 0) {
          choices.push(
            questionMultipleChoices[
              faker.datatype.number({
                min: 0,
                max: questionMultipleChoices.length - 1,
              })
            ]
          );
        }
        return choices;
      case 'boolean':
        return faker.datatype.boolean();
      case 'multipletext':
        let items = {};
        questionStructure.items.forEach((item: any) => {
          items[item.name] = faker.lorem.sentence();
        });
        return items;
      case 'matrix':
        let matrixItems = {};
        questionStructure.rows.forEach((row: any) => {
          matrixItems[row.value] =
            questionStructure.columns[
              faker.datatype.number({
                min: 0,
                max: questionStructure.columns.length - 1,
              })
            ].value;
        });
        return matrixItems;
      case 'matrixdropdown':
        let matrixDropdownItems = {};
        const questionChoices1 = questionStructure.choices.map((item) =>
          typeof item === 'object' ? item.value : item
        );
        questionStructure.rows.forEach((row: any) => {
          matrixDropdownItems[row.value] = {};
          questionStructure.columns.forEach((column: any) => {
            const matrixDropdownChoices = column.choices?.map((item) =>
              typeof item === 'object' ? item.value : item
            );
            // If choices are set for the column, use them, otherwise use the choices set for the question
            const columnChoices = matrixDropdownChoices ?? questionChoices1;
            switch (column.cellType) {
              case null:
              case undefined: // Undefined(default) is a dropdown which always uses the question choices
                matrixDropdownItems[row.value][column.name] = questionChoices1[
                  faker.datatype.number({
                    min: 0,
                    max: questionChoices1.length - 1,
                  })
                ].map((item) => (typeof item === 'object' ? item.value : item));
                break;
              case 'dropdown':
              case 'radiogroup':
                matrixDropdownItems[row.value][column.name] =
                  columnChoices[
                    faker.datatype.number({
                      min: 0,
                      max: columnChoices.length - 1,
                    })
                  ];
                break;
              case 'checkbox':
              case 'tagbox':
                let choices = [];
                columnChoices.forEach((choice: any) => {
                  if (faker.datatype.boolean()) {
                    choices.push(choice);
                  }
                });
                if (choices.length === 0) {
                  choices.push(
                    columnChoices[
                      faker.datatype.number({
                        min: 0,
                        max: columnChoices.length - 1,
                      })
                    ]
                  );
                }
                matrixDropdownItems[row.value][column.name] = choices;
                break;
              case 'boolean':
                matrixDropdownItems[row.value][column.name] =
                  faker.datatype.boolean();
                break;
              case 'text':
              case 'comment':
                matrixDropdownItems[row.value][column.name] =
                  faker.lorem.sentence();
                break;
              case 'rating':
                matrixDropdownItems[row.value][column.name] =
                  faker.datatype.number({ min: 1, max: 5 });
                break;
              case 'expression':
                break;
              default:
                break;
            }
          });
        });
        return matrixDropdownItems;
      case 'matrixdynamic':
        let matrixDynamicItems = [];
        const questionChoices2 = questionStructure.choices.map((item) =>
          typeof item === 'object' ? item.value : item
        );
        // Since we don't know the number of rows, we'll generate a random number of rows between 1 and 5
        for (let i = 0; i < faker.datatype.number({ min: 1, max: 5 }); i++) {
          let matrixDynamicItem = {};
          questionStructure.columns.forEach((column: any) => {
            const matrixDynamicChoices = column.choices?.map((item) =>
              typeof item === 'object' ? item.value : item
            );
            const columnChoices = matrixDynamicChoices ?? questionChoices2;
            switch (column.cellType) {
              case null:
              case undefined:
                matrixDynamicItem[column.name] =
                  questionChoices2[
                    faker.datatype.number({
                      min: 0,
                      max: questionChoices2.length - 1,
                    })
                  ];
                break;
              case 'dropdown':
              case 'radiogroup':
                matrixDynamicItem[column.name] =
                  columnChoices[
                    faker.datatype.number({
                      min: 0,
                      max: columnChoices.length - 1,
                    })
                  ];
                break;
              case 'checkbox':
              case 'tagbox':
                let choices = [];
                columnChoices.forEach((choice: any) => {
                  if (faker.datatype.boolean()) {
                    choices.push(choice);
                  }
                });
                if (choices.length === 0) {
                  choices.push(
                    columnChoices[
                      faker.datatype.number({
                        min: 0,
                        max: columnChoices.length - 1,
                      })
                    ]
                  );
                }
                matrixDynamicItem[column.name] = choices;
                break;
              case 'boolean':
                matrixDynamicItem[column.name] = faker.datatype.boolean();
                break;
              case 'text':
              case 'comment':
                matrixDynamicItem[column.name] = faker.lorem.sentence();
                break;
              case 'rating':
                matrixDynamicItem[column.name] = faker.datatype.number({
                  min: 1,
                  max: 5,
                });
                break;
              case 'expression':
                break;
              default:
                break;
            }
          });
          matrixDynamicItems.push(matrixDynamicItem);
        }
        return matrixDynamicItems;
      case 'expression':
        return;
      case 'resource':
        const record = await Record.findOne({
          resource: questionStructure.resource,
          archived: { $ne: true },
        }).skip(
          faker.datatype.number({
            min: 0,
            max:
              (await Record.countDocuments({
                resource: questionStructure.resource,
                archived: { $ne: true },
              })) - 1,
          })
        );
        return record.id;

      case 'resources':
        const records = await Record.find({
          resource: questionStructure.resource,
          archived: { $ne: true },
        }).skip(
          faker.datatype.number({
            min: 0,
            max:
              (await Record.countDocuments({
                resource: questionStructure.resource,
                archived: { $ne: true },
              })) - 1,
          })
        );
        return records.map((x) => x.id);

      case 'owner':
        let roles = [];
        await Promise.all(
          questionStructure.applications?.map(async (application: any) => {
            const tempRoles = await Role.find({
              application,
            });
            tempRoles.forEach((role: any) => {
              if (faker.datatype.boolean()) {
                roles.push(role.id);
              }
            });
            if (
              questionStructure.isRequired && // If the question is required we push a random role if none are generated
              roles.length === 0 &&
              tempRoles.length > 0
            ) {
              roles.push(
                tempRoles[
                  faker.datatype.number({
                    min: 0,
                    max: tempRoles.length - 1,
                  })
                ].id
              );
            }
          })
        );
        return roles;
      case 'users':
        let users = [];
        if (questionStructure.applications) {
          // If an application is set in the question, we only get users with roles in that application
          await Promise.all(
            questionStructure.applications.map(async (application: any) => {
              const tempRoles = await Role.find({
                application,
              });
              for (const role of tempRoles) {
                const tempUsers = await User.find({
                  roles: role.id,
                });
                for (const user of tempUsers) {
                  if (faker.datatype.boolean() && !users.includes(user.id)) {
                    users.push(user.id);
                  }
                }
                if (
                  questionStructure.isRequired &&
                  users.length === 0 &&
                  tempUsers.length > 0
                ) {
                  users.push(
                    tempUsers[
                      faker.datatype.number({
                        min: 0,
                        max: tempUsers.length - 1,
                      })
                    ].id
                  );
                }
              }
            })
          );
        } else {
          // If no application is set, we get any users
          const tempUsers = await User.find();
          for (const user of tempUsers) {
            if (faker.datatype.boolean()) {
              users.push(user.id);
            }
          }
          if (
            questionStructure.isRequired &&
            users.length === 0 &&
            tempUsers.length > 0
          ) {
            users.push(
              tempUsers[
                faker.datatype.number({
                  min: 0,
                  max: tempUsers.length - 1,
                })
              ].id
            );
          }
        }
        return users;
      case 'geospatial':
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              Number(faker.address.longitude()),
              Number(faker.address.latitude()),
            ],
          },
          properties: {},
        };
      case 'paneldynamic':
        let panelData = [];
        for (let i = 0; i < faker.datatype.number({ min: 1, max: 5 }); i++) {
          let panelItem = {};
          await Promise.all(
            questionStructure.templateElements?.map(
              async (panelQuestion: any) => {
                panelItem[panelQuestion.name] = await _generateFieldData(
                  panelQuestion,
                  {}
                );
              }
            )
          );
          panelData.push(panelItem);
        }
        return panelData;
      default:
        return faker.lorem.sentence();
    }
  };
  await Promise.all(
    fields.map(async (field: any) => {
      const questionStructure = questionsStructure.find(
        (obj: any) => obj.name === field.field
      );
      const actions = {
        minDate: field.minDate,
        maxDate: field.maxDate,
        minNumber: field.minNumber,
        maxNumber: field.maxNumber,
        minTime: field.minTime,
        maxTime: field.maxTime,
      };
      if (field.include) {
        if (field.setDefault) {
          return field.default; // If default value is set, use it
        }
        data[questionStructure.name] = await _generateFieldData(
          questionStructure,
          actions
        );
      }
    })
  );
  console.log(JSON.stringify(data, null, 2));
  return data;
};
