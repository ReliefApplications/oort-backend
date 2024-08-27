import { snakeCase } from 'lodash';
import { mapKoboExpression } from './kobo/mapKoboExpression';

import { validateGraphQLTypeName } from '@utils/validators';

/**
 * Returns the a valid name for a kobo form entity
 *
 * @param name name to validate
 * @returns the same name if it's valid, or a snake case version of it
 */
export const getValidName = (name: string) => {
  try {
    validateGraphQLTypeName(name);
    return name;
  } catch (_) {
    return snakeCase(name);
  }
};

/** Default survey structure */
const DEFAULT_SURVEY = {
  title: '',
  pages: [
    {
      name: 'page1',
      elements: [],
    },
  ],
  showQuestionNumbers: 'off',
  checkErrorsMode: 'onValueChanged',
  hidePagesTab: true,
  defaultLanguage: 'en',
};

/** Available fields types in kobo that are compatible with oort */
const AVAILABLE_TYPES = [
  'decimal',
  'geopoint',
  'geoshape',
  'geotrace',
  'select_multiple',
  'select_one',
  'date',
  'note',
  'begin_score',
  'score__row',
  'barcode',
  'text',
  'time',
  'file',
  'integer',
  'datetime',
  'acknowledge',
  'begin_rank',
  'rank__level',
  'range',
  'image',
  'audio',
  'video',
  'calculate',
  'begin_group',
  'end_group',
  'begin_repeat',
  'end_repeat',
  'end_score',
  'end_rank',
  'begin_kobomatrix',
  'end_kobomatrix',
];

type ExtractKoboFieldsProps = {
  questions: any;
  title: string;
  choices: any;
  translations: string[];
};

/**
 * Extract kobo form fields and convert to oort fields
 *
 * @param options options object
 * @param options.questions Kobo survey structure
 * @param options.title Kobo survey title
 * @param options.choices Kobo choices data for the questions
 * @param options.translations Kobo translations data for the questions
 * @returns oort survey
 */
export const extractKoboFields = ({
  questions,
  title,
  choices,
  translations,
}: ExtractKoboFieldsProps) => {
  const context: any[] = [];
  let matrixElement = null;
  const survey = DEFAULT_SURVEY;

  const pushQuestion = (question: any) => {
    if (matrixElement) {
      const element = structuredClone(question);
      element.cellType = element.type;
      delete element.type;

      matrixElement.columns.push(element);
      return;
    }

    const parent = context.length ? context.at(-1) : survey.pages[0];
    const children = parent.elements ?? parent.templateElements ?? [];

    children.push(question);
  };

  survey.title = title;
  survey.pages[0].elements = [];
  let newRateQuestion: any = null;
  let rakingItems: string[] = [];
  let rankChoiceId = '';

  const langs = translations
    .map((translation) => {
      if (!translation) {
        return null;
      }
      const inBetweenParentheses = translation.match(/\(([^)]+)\)/);
      return inBetweenParentheses ? inBetweenParentheses[1] : null;
    })
    .filter((lang) => lang);

  // The first translation is the default language
  survey.defaultLanguage = langs[0];

  const getLabelTranslations = (labels: string[]) => {
    if (!labels || !Array.isArray(labels)) {
      return labels;
    }
    if (labels.length === 1) {
      return labels[0];
    }
    const res = {};
    translations.forEach((_, idx) => {
      const lang = idx === 0 ? 'default' : langs[idx];
      res[lang] = labels[idx];
    });

    return res;
  };

  const validators = (question: any) => {
    return {
      validators: [
        {
          type: 'expression',
          text: question.constraint_message
            ? typeof question.constraint_message === 'string'
              ? question.constraint_message
              : question.constraint_message[0]
            : '',
          expression: mapKoboExpression(
            question.constraint,
            question.$given_name ?? question.$autoname
          ),
        },
      ],
      validateOnValueChange: true,
    };
  };

  console.log(JSON.stringify(questions));
  questions.map((question: any, index: number) => {
    // Save the context path for reference later
    const path = context
      .map((element) => element.name)
      .concat(question.$given_name ?? question.$autoname)
      .join('/');
    const valueName = question.$given_name ?? question.$autoname;

    const sharedProps = () => {
      return {
        index,
        name: getValidName(valueName),
        title: getLabelTranslations(question.label ?? valueName),
        valueName,
        isRequired: question.required,
        ...(question.hint && {
          description: getLabelTranslations(question.hint),
        }),
        ...(question.default && {
          defaultValue: mapKoboExpression(question.default),
        }),
        ...(question.relevant && {
          visibleIf: mapKoboExpression(question.relevant),
        }),
        ...(question.constraint && validators(question)),
        kobo: {
          type: question.type,
          path,
        },
      };
    };

    if (AVAILABLE_TYPES.includes(question.type)) {
      switch (question.type) {
        case 'decimal': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'number',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'geoshape':
        case 'geotrace':
        case 'geopoint': {
          const typeToFeature = {
            geoshape: 'Polygon',
            geotrace: 'PolyLine',
            geopoint: 'Point',
          } as const;

          const newQuestion = {
            ...sharedProps(),
            type: 'geospatial',
            geometry: typeToFeature[question.type],
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'select_one':
        case 'select_multiple': {
          const newQuestion = {
            ...sharedProps(),
            type:
              question.type === 'select_multiple' ? 'checkbox' : 'radiogroup',
            choices: choices
              .filter(
                (choice) => question.select_from_list_name === choice.list_name
              )
              .map((choice) => ({
                value: choice.$autovalue,
                text: getLabelTranslations(choice.label),
                ...(question.choice_filter &&
                  // If in the Kobo form the choice has the 'other' property, we will not add the visibleIf because of the 'or other=0' in the expression
                  !Object.prototype.hasOwnProperty.call(choice, 'other') && {
                    visibleIf: mapKoboExpression(
                      question.choice_filter,
                      null,
                      choice.$autovalue
                    ),
                  }),
              })),
            ...(question.parameters &&
              question.parameters.split('randomize=')[1]?.includes('true') && {
                choicesOrder: 'random',
              }),
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'date': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'date',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'note': {
          const newQuestion = {
            ...sharedProps(),
            type: 'expression',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'begin_score': {
          newRateQuestion = {
            ...sharedProps(),
            type: 'matrixdropdown',
            columns: [
              {
                name: 'rating',
                cellType: 'radiogroup',
                showInMultipleColumns: true,
              },
            ],
            choices: choices
              .filter(
                (choice) => question['kobo--score-choices'] === choice.list_name
              )
              .map((choice) => ({
                value: choice.$autovalue,
                text: getLabelTranslations(choice.label),
              })),
            rows: [],
          };
          break;
        }
        case 'score__row': {
          newRateQuestion.rows.push({
            value: valueName,
            text: getLabelTranslations(question.label),
          });
          break;
        }
        case 'end_score': {
          // Add the matrix question to the survey
          pushQuestion(newRateQuestion);

          // Reset the newRateQuestion object
          newRateQuestion = null;
          break;
        }
        case 'begin_rank': {
          rankChoiceId = question['kobo--rank-items'];
          rakingItems = [];
          break;
        }
        case 'rank__level': {
          rakingItems.push(valueName);

          const newQuestion = {
            ...sharedProps(),
            type: 'dropdown',
            choices: choices
              .filter((choice) => rankChoiceId === choice.list_name)
              .map((choice) => ({
                value: choice.$autovalue,
                text: getLabelTranslations(choice.label),
              })),
          };

          pushQuestion(newQuestion);
          break;
        }
        case 'end_rank': {
          // For the last rank_level questions, we add validators to ensure that they can never be the same as the previous ones

          const rakingQuestions = survey.pages[0].elements.slice(
            -rakingItems.length
          );

          rakingQuestions.forEach((rakingQuestion) => {
            rakingQuestion.validators = rakingQuestions
              .filter((q) => {
                return q.name !== rakingQuestion.name;
              })
              .map((item) => ({
                type: 'expression',
                text: `Value can't be the same as ${item.title ?? item.name}`,
                expression: `{${item.name}} <> {${rakingQuestion.name}} or {${rakingQuestion.name}} empty`,
              }));
          });

          break;
        }
        case 'begin_kobomatrix': {
          const rows = choices
            .filter(
              (choice) => question['kobo--matrix_list'] === choice.list_name
            )
            .map((choice) => ({
              value: choice.$autovalue,
              text: getLabelTranslations(choice.label),
            }));

          const newMatrixQuestion = {
            ...sharedProps(),
            type: 'matrixdropdown',
            columns: [],
            rows,
          };

          pushQuestion(newMatrixQuestion);
          matrixElement = newMatrixQuestion;
          break;
        }
        case 'end_kobomatrix': {
          matrixElement = null;
          break;
        }
        case 'barcode':
        case 'text': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'time': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'time',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'audio':
        case 'video':
        case 'image':
        case 'file': {
          const newQuestion = {
            ...sharedProps(),
            type: 'file',
            storeDataAsText: false,
            maxSize: 7340032,
            acceptedTypes:
              question.type !== 'file' ? `${question.type}/*` : undefined,
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'integer': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'number',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'datetime': {
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'datetime-local',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'acknowledge': {
          const newQuestion = {
            ...sharedProps(),
            type: 'boolean',
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'range': {
          // Parameters are in the format 'start=0;end=10;step=1'
          const parameters = question.parameters.split(';');
          const [minValue, maxValue] = parameters
            .slice(0, 2)
            .map((param) => parseInt(param.split('=')[1]));
          const step = parseInt(parameters[2].split('=')[1]);
          const newQuestion = {
            ...sharedProps(),
            type: 'text',
            inputType: 'range',
            step: typeof step === 'number' ? step : undefined,
            min: typeof minValue === 'number' ? minValue : undefined,
            max: typeof maxValue === 'number' ? maxValue : undefined,
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'calculate': {
          const newQuestion = {
            ...sharedProps(),
            type: 'expression',
            visible: false, // They are not displayed in the Kobo form, so make it invisible by default for the SurveyJS
            expression: mapKoboExpression(question.calculation),
            // This question does not have hint (description)
          };
          pushQuestion(newQuestion);
          break;
        }
        case 'begin_group': {
          const newGroupElement = {
            ...sharedProps(),
            type: 'panel',
            title: ' ',
            elements: [],
          };

          pushQuestion(newGroupElement);
          context.push(newGroupElement);

          break;
        }
        case 'end_group': {
          context.pop();
          break;
        }
        case 'begin_repeat': {
          const newRepeatGroupElement = {
            ...sharedProps(),
            type: 'paneldynamic',
            confirmDelete: true,
            panelCount: 1,
            templateElements: [],
          };

          pushQuestion(newRepeatGroupElement);
          context.push(newRepeatGroupElement);

          break;
        }
        case 'end_repeat': {
          context.pop();

          break;
        }
      }
    }
  });
  // Order elements (is necessary because of groups being added to the survey elements only after closed)
  survey.pages[0].elements = survey.pages[0].elements.sort((a, b) =>
    a.index > b.index ? 1 : -1
  );

  return survey;
};
