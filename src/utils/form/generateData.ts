import { faker } from '@faker-js/faker';
import { Record, Application, Role, User } from '@models';
var randomGeoJSON = require('geojson-random');

export const generateData = async (fields: any, structure: any) => {
  let data = {};
  await Promise.all(
    fields.map(async (field: any) => {
      if (field.include) {
        if (field.setDefault) {
          data[field.field] = field.default;
        } else {
          const questionStructure = structure.find(
            (x: any) => x.name === field.field
          );
          switch (questionStructure.type) {
            case 'text':
              switch (field.option) {
                case 'month':
                  data[field.field] = faker.date.month();
                  break;
                case 'password':
                  data[field.field] = faker.internet.password();
                  break;
                case 'range':
                  data[field.field] = faker.datatype.number({
                    min: 0,
                    max: 100,
                  });
                  break;
                case 'week':
                  data[field.field] =
                    faker.datatype.number({ min: 2000, max: 2030 }) +
                    '-W' +
                    faker.datatype.number({ min: 1, max: 52 });
                  break;
                case 'sentence':
                default:
                  data[field.field] = faker.lorem.sentence();
                  break;
              }
              break;
            case 'radiogroup':
            case 'dropdown':
              const questionSingleChoices = questionStructure.choices;
              data[field.field] =
                questionSingleChoices[
                  faker.datatype.number({
                    min: 0,
                    max: questionSingleChoices.length - 1,
                  })
                ].value;
              break;
            case 'tagbox':
            case 'checkbox':
              let choices = [];
              const questionMultipleChoices = questionStructure.choices;
              questionMultipleChoices.forEach((choice: any) => {
                if (faker.datatype.boolean()) {
                  choices.push(choice.value);
                }
              });
              if (choices.length === 0) {
                choices.push(
                  questionMultipleChoices[
                    faker.datatype.number({
                      min: 0,
                      max: questionMultipleChoices.length - 1,
                    })
                  ].value
                );
              }
              data[field.field] = choices;
              break;
            case 'boolean':
              data[field.field] = faker.datatype.boolean();
              break;
            case 'multipletext':
              let items = {};
              structure
                .find((x: any) => x.name === field.field)
                .items.forEach((item: any) => {
                  items[item.name] = faker.lorem.sentence();
                });
              data[field.field] = items;
              break;
            case 'matrix':
              let matrixItems = {};
              questionStructure.rows.forEach((row: any) => {
                matrixItems[row.name] =
                  questionStructure.columns[
                    faker.datatype.number({
                      min: 0,
                      max: questionStructure.columns.length - 1,
                    })
                  ].name;
              });
              data[field.field] = matrixItems;
              break;
            case 'matrixdropdown':
              let matrixDropdownItems = {};
              questionStructure.rows.forEach((row: any) => {
                matrixDropdownItems[row.name] = {};
                questionStructure.columns.forEach((column: any) => {
                  const columnChoices =
                    column.choices ?? questionStructure.choices;
                  switch (column.type) {
                    case null:
                    case 'dropdown':
                    case 'radiogroup':
                      matrixDropdownItems[row.name][column.name] =
                        columnChoices[
                          faker.datatype.number({
                            min: 0,
                            max: columnChoices.length - 1,
                          })
                        ].value;
                      break;
                    case 'checkbox':
                    case 'tagbox':
                      let choices = [];
                      columnChoices.forEach((choice: any) => {
                        if (faker.datatype.boolean()) {
                          choices.push(choice.value);
                        }
                      });
                      if (choices.length === 0) {
                        choices.push(
                          columnChoices[
                            faker.datatype.number({
                              min: 0,
                              max: columnChoices.length - 1,
                            })
                          ].value
                        );
                      }
                      matrixDropdownItems[row.name][column.name] = choices;
                      break;
                    case 'boolean':
                      matrixDropdownItems[row.name][column.name] =
                        faker.datatype.boolean();
                      break;
                    case 'text':
                    case 'comment':
                      matrixDropdownItems[row.name][column.name] =
                        faker.lorem.sentence();
                      break;
                    case 'rating':
                      matrixDropdownItems[row.name][column.name] =
                        faker.datatype.number({ min: 1, max: 5 });
                      break;
                    case 'expression':
                      // i dont know
                      break;
                    default:
                      break;
                  }
                });
              });
              data[field.field] = matrixDropdownItems;
              break;
            case 'matrixdynamic':
              let matrixDynamicItems = [];
              for (
                let i = 0;
                i < faker.datatype.number({ min: 1, max: 5 });
                i++
              ) {
                let matrixDynamicItem = {};
                questionStructure.columns.forEach((column: any) => {
                  const columnChoices =
                    column.choices ?? questionStructure.choices;
                  switch (column.type) {
                    case null:
                    case 'dropdown':
                    case 'radiogroup':
                      matrixDynamicItem[column.name] =
                        columnChoices[
                          faker.datatype.number({
                            min: 0,
                            max: columnChoices.length - 1,
                          })
                        ].value;
                      break;
                    case 'checkbox':
                    case 'tagbox':
                      let choices = [];
                      columnChoices.forEach((choice: any) => {
                        if (faker.datatype.boolean()) {
                          choices.push(choice.value);
                        }
                      });
                      if (choices.length === 0) {
                        choices.push(
                          columnChoices[
                            faker.datatype.number({
                              min: 0,
                              max: columnChoices.length - 1,
                            })
                          ].value
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
                      // i dont know
                      break;
                    default:
                      break;
                  }
                });
                matrixDynamicItems.push(matrixDynamicItem);
              }
              data[field.field] = matrixDynamicItems;
              break;
            case 'expression':
              // i dont know
              break;
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
              data[field.field] = record.id;
              break;
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
              data[field.field] = records.map((x) => x.id);
              break;
            case 'owner':
              let roles = [];
              // Using Promise.all to wait for all async operations to complete
              await Promise.all(
                questionStructure.applications?.map(
                  async (application: any) => {
                    const tempRoles = await Role.find({
                      application,
                    });

                    tempRoles.forEach((role: any) => {
                      if (faker.datatype.boolean()) {
                        roles.push(role.id);
                      }
                    });
                    if (
                      questionStructure.isRequired &&
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
                  }
                )
              );
              data[field.field] = roles;
              break;
            case 'users':
              let users = [];
              if (questionStructure.applications) {
                await Promise.all(
                  questionStructure.applications.map(
                    async (application: any) => {
                      const tempRoles = await Role.find({
                        application,
                      });
                      for (const role of tempRoles) {
                        const tempUsers = await User.find({
                          roles: role.id,
                        });
                        for (const user of tempUsers) {
                          if (
                            faker.datatype.boolean() &&
                            !users.includes(user.id)
                          ) {
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
                    }
                  )
                );
              } else {
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
              data[field.field] = users;
              break;
            case 'geospatial':
              data[field.field] = randomGeoJSON.point(1).features[0];
              break;
            case 'color':
              data[field.field] = faker.internet.color();
              break;
            case 'date':
              data[field.field] = new Date(
                faker.date
                  .between(
                    '2020-01-01T00:00:00.000Z',
                    '2030-01-01T00:00:00.000Z'
                  )
                  .setHours(0, 0, 0, 0)
              ).toISOString();
              break;
            case 'datetime-local':
              data[field.field] = faker.date
                .between('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
                .toISOString();
              break;
            case 'email':
              data[field.field] = faker.internet.email();
              break;
            case 'numeric':
              data[field.field] = faker.datatype.number({ min: 0, max: 1000 });
              break;
            case 'tel':
              data[field.field] = faker.phone.number();
              break;
            case 'time':
              data[field.field] = faker.date
                .between('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
                .toISOString();
              break;
            case 'url':
              data[field.field] = faker.internet.url();
              break;
            default:
              break;
          }
        }
      }
    })
  );
  return data;
};
