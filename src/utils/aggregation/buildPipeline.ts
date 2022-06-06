import { GraphQLError } from 'graphql';
import { Form } from '../../models';
import {
  forbiddenKeywords,
  operatorsMapping,
  PipelineStage,
} from '../../const/aggregation';
import getFilter from '../schema/resolvers/Query/getFilter';

/**
 * Builds a addFields pipeline stage.
 *
 * @param settings Stage settings.
 * @returns Mongo pipeline stage.
 */
const addFields = (
  settings: { name: string; expression: { operator: string; field: string } }[]
): any => {
  return settings.reduce((o, value) => {
    const operator = operatorsMapping.find(
      (x) => x.id === value.expression.operator
    );
    return Object.assign(o, {
      [value.name ? value.name : value.expression.operator]: operator.mongo(
        value.expression.field
      ),
    });
  }, {});
};

/**
 * Builds pipeline from list of stage configurations.
 *
 * @param pipeline Current pipeline.
 * @param settings Stage configurations.
 * @param form Current form.
 * @param context request context.
 */
const buildPipeline = (
  pipeline: any[],
  settings: any[],
  form: Form,
  context
): any => {
  for (const stage of settings) {
    switch (stage.type) {
      case PipelineStage.FILTER: {
        pipeline.push({
          $match: getFilter(stage.form, form.fields, context, ''),
        });
        break;
      }
      case PipelineStage.SORT: {
        pipeline.push({
          $sort: {
            [stage.form.field]: stage.form.order === 'asc' ? 1 : -1,
          },
        });
        break;
      }
      case PipelineStage.GROUP: {
        if (stage.form.groupBy.includes('.')) {
          const fieldArray = stage.form.groupBy.split('.');
          const parent = fieldArray.shift();
          pipeline.push({
            $unwind: `$${parent}`,
          });
        }
        pipeline.push({
          $unwind: `$${stage.form.groupBy}`,
        });
        if (
          stage.form.groupByExpression &&
          stage.form.groupByExpression.operator
        ) {
          pipeline.push({
            $addFields: addFields([
              {
                name: stage.form.groupBy,
                expression: {
                  operator: stage.form.groupByExpression.operator,
                  field: stage.form.groupBy,
                },
              },
            ]),
          });
        }
        pipeline.push({
          $group: {
            _id: { $toString: `$${stage.form.groupBy}` },
            ...addFields(stage.form.addFields),
          },
        });
        pipeline.push({
          $project: {
            [stage.form.groupBy]: '$_id',
            _id: 0,
            ...(stage.form.addFields as any[]).reduce(
              (o, addField) =>
                Object.assign(o, {
                  [addField.name
                    ? addField.name
                    : addField.expression.operator]: 1,
                }),
              {}
            ),
          },
        });
        break;
      }
      case PipelineStage.ADD_FIELDS: {
        pipeline.push({
          $addFields: addFields(stage.form),
        });
        break;
      }
      case PipelineStage.UNWIND: {
        if (stage.form.field.includes('.')) {
          const fieldArray: string[] = stage.form.field.split('.');
          for (let i = 0; i < fieldArray.length; i++) {
            pipeline.push({
              $unwind: `$${fieldArray.slice(0, i + 1).join('.')}`,
            });
          }
        } else {
          pipeline.push({
            $unwind: `$${stage.form.field}`,
          });
        }
        break;
      }
      case PipelineStage.CUSTOM: {
        const custom: string = stage.form.raw;
        if (forbiddenKeywords.some((x: string) => custom.includes(x))) {
          throw new GraphQLError(
            context.i18next.t('errors.invalidCustomStage')
          );
        }
        try {
          pipeline.push(JSON.parse(custom));
        } catch {
          throw new GraphQLError(
            context.i18next.t('errors.invalidCustomStage')
          );
        }
        break;
      }
      default: {
        break;
      }
    }
  }
};

export default buildPipeline;
