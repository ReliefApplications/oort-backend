import { GraphQLBoolean, GraphQLError, GraphQLNonNull } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { Form, Record } from '../../models';
import errors from '../../const/errors';
import { AppAbility } from '../../security/defineAbilityFor';
import { getFormPermissionFilter } from '../../utils/filter';
import { StageType } from '../../const/aggregationStages';
import getFilter from '../../utils/schema/resolvers/Query/getFilter';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import getDisplayText from '../../utils/form/getDisplayText';

export default {
  /* Take an aggregation configuration as parameter.
        Returns aggregated records data.
    */
  type: GraphQLJSON,
  args: {
    aggregation: { type: new GraphQLNonNull(GraphQLJSON) },
    withMapping: { type: GraphQLBoolean },
  },
  async resolve(parent, args, context) {
    // Authentication check
    const user = context.user;
    const ability: AppAbility = context.user.ability;
    if (!user) {
      throw new GraphQLError(errors.userNotLogged);
    }

    const pipeline: any[] = [];
    const globalFilters: any[] = [
      {
        archived: { $ne: true },
      },
    ];
    // Check against records permissions if needed
    if (!ability.can('read', 'Record')) {
      const allFormPermissionsFilters = [];
      const forms = await Form.find({}).select('_id permissions');
      for (const form of forms) {
        if (form.permissions.canSeeRecords.length > 0) {
          const permissionFilters = getFormPermissionFilter(
            user,
            form,
            'canSeeRecords'
          );
          if (permissionFilters.length > 0) {
            allFormPermissionsFilters.push({
              $and: [{ form: form._id }, { $or: permissionFilters }],
            });
          }
        } else {
          allFormPermissionsFilters.push({ form: form._id });
        }
      }
      globalFilters.push({ $or: allFormPermissionsFilters });
    }
    // Build data source step
    const form = await Form.findById(
      args.aggregation.dataSource,
      'core fields resource'
    );
    if (args.aggregation.dataSource) {
      if (form.core) {
        globalFilters.push({
          resource: mongoose.Types.ObjectId(form.resource),
        });
      } else {
        globalFilters.push({
          form: mongoose.Types.ObjectId(args.aggregation.dataSource),
        });
      }
      pipeline.push({
        $match: {
          $and: globalFilters,
        },
      });
    } else {
      throw new GraphQLError(errors.invalidAggregation);
    }
    // Build the source fields step
    if (args.aggregation.sourceFields && args.aggregation.sourceFields.length) {
      pipeline.push({
        $project: (args.aggregation.sourceFields as any[]).reduce(
          (o, field) =>
            Object.assign(o, {
              [field]: `$data.${field}`,
            }),
          {}
        ),
      });
    } else {
      throw new GraphQLError(errors.invalidAggregation);
    }
    // Build pipeline stages
    if (args.aggregation.pipeline && args.aggregation.pipeline.length) {
      for (const stage of args.aggregation.pipeline) {
        switch (stage.type) {
          case StageType.FILTER: {
            const filters = getFilter(stage.form, form.fields, context);
            pipeline.push({
              $match: EJSON.deserialize(filters),
            });
            break;
          }
          case StageType.SORT: {
            pipeline.push({
              $sort: {
                [stage.form.field]: stage.form.order === 'asc' ? 1 : -1,
              },
            });
            break;
          }
          case StageType.GROUP: {
            //TO DO
            break;
          }
          case StageType.ADD_FIELDS: {
            //TO DO
            break;
          }
          case StageType.UNWIND: {
            //TO DO
            break;
          }
          case StageType.CUSTOM: {
            //TO DO
            break;
          }
          default: {
            break;
          }
        }
      }
    }
    // Build mapping step
    if (args.withMapping && args.aggregation.mapping) {
      pipeline.push({
        $project: {
          category: `$${args.aggregation.mapping.xAxis}`,
          field: `$${args.aggregation.mapping.yAxis}`,
          id: '$_id',
        },
      });
    }
    const records = await Record.aggregate(pipeline);
    const itemsNames = [];
    const fieldUsed = args.withMapping
      ? [args.aggregation.mapping.xAxis, args.aggregation.mapping.yAxis]
      : Object.keys(records[0]);
    // remove _id from array
    if (!args.withMapping) {
      const index = fieldUsed.indexOf('_id');
      if (index > -1) {
        fieldUsed.splice(index, 1);
      }
    }

    // Gather all field and value needed for getDisplayText function
    form.fields.forEach((field: any) => {
      if (fieldUsed.includes(field.name) && (field.items || field.choices)) {
        const choiceArray = field.items ?? field.choices;
        choiceArray.forEach((item: any) => {
          itemsNames.push({
            field: field,
            value: item.name ?? item.value,
            name: field.name,
          });
        });
      }
    });
    // For each record we look if we need to use the getDisplayText on category or field
    for await (const record of records) {
      if (!args.withMapping) {
        // we loop over each field of the record to get the text if needed
        for (const element in record) {
          const newElementItems = [];
          if (!['_id', 'id'].includes(element)) {
            for (const item of itemsNames) {
              if (item.name === element) {
                const newElementItem = await getDisplayText(
                  item.field,
                  item.value,
                  context
                );
                newElementItems.push(newElementItem);
                record[element] = newElementItems;
              }
            }
          }
        }
      } else {
        // we loop over category and field to get the display text
        const namesToLoop = ['category', 'field'];
        for (const name of namesToLoop) {
          const newElementItems = [];
          if (record[name]) {
            if (!record[name].length) {
              record[name] = Object.keys(record[name]);
            }
            for (const element of record[name]) {
              for (const item of itemsNames) {
                if (item.value === element) {
                  const newElementItem = await getDisplayText(
                    item.field,
                    item.value,
                    context
                  );
                  newElementItems.push(newElementItem);
                }
              }
            }
          }
          record[name] = newElementItems;
        }
      }
    }
    return records;
  },
};
