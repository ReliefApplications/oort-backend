import { GraphQLError } from 'graphql/error';
import { getFieldType } from './getFieldType';
import i18next from 'i18next';
import { validateGraphQLFieldName } from '@utils/validators';
import { Field, Form } from '@models';

/** Choice item interface for dropdown, radio, checkbox, tagbox, and matrix elements */
interface ChoiceItem {
  value?: string;
  text?: string;
}

/** Row item interface for matrix elements */
interface RowItem {
  value?: string;
  text?: string;
}

/** Column item interface for matrix elements */
interface ColumnItem {
  name?: string;
  value?: string;
  text?: string;
  title?: string;
  cellType?: string;
  choices?: ChoiceItem[];
}

/** Multiple text item interface */
interface MultipleTextItem {
  name: string;
  title?: string;
}

/** Choices by URL configuration interface */
interface ChoicesByUrl {
  url?: string;
  path?: string;
  valueName?: string;
  titleName?: string;
}

/** Form element interface representing a SurveyJS question/element */
interface FormElement {
  type?: string;
  valueName?: string;
  omitField?: boolean;
  unique?: boolean;
  isRequired?: boolean;
  omitOnXlsxTemplate?: boolean;
  readOnly?: boolean;
  kobo?: { type: string };
  defaultValue?: unknown;
  relatedName?: string;
  resource?: string;
  displayField?: string;
  displayAsGrid?: boolean;
  displayOnly?: boolean;
  canAddNew?: boolean;
  addTemplate?: unknown;
  gridFieldsSettings?: unknown;
  items?: MultipleTextItem[];
  rows?: RowItem[];
  columns?: ColumnItem[];
  choices?: ChoiceItem[];
  cellType?: string;
  choicesExpression?: string;
  choicesByUrl?: ChoicesByUrl | string;
  referenceData?: string;
  referenceDataDisplayField?: string;
  hasOther?: boolean;
  otherText?: string;
  otherPlaceHolder?: string;
  hasComment?: boolean;
  showCommentArea?: boolean;
  showOtherItem?: boolean;
  applications?: unknown;
  geometry?: string;
  elements?: FormElement[];
}

/** Form structure object interface (page or panel) */
interface FormStructureObject {
  elements?: FormElement[];
}

/**
 * Push in fields array all detected fields in the json structure of object.
 * Function by induction.
 *
 * @param object form structure object, page or panel
 * @param fields list of fields
 * @param core is the form core ?
 */
export const extractFields = async (
  object: FormStructureObject,
  fields: Field[],
  core: boolean
): Promise<void> => {
  if (!object.elements) {
    return;
  }

  for (const element of object.elements) {
    if (element.omitField) {
      continue;
    }
    if (element.type === 'panel') {
      await extractFields(element as FormStructureObject, fields, core);
      continue;
    }
    if (element.type === 'resources' && element.displayOnly) {
      // Don't store as field if question is display only
      continue;
    }
    if (!element.valueName) {
      throw new GraphQLError(
        i18next.t('utils.form.extractFields.errors.missingDataField')
      );
    }

    validateGraphQLFieldName(element.valueName, i18next);
    const type = await getFieldType(element);
    const field: Form['fields'][number] = {
      type,
      name: element.valueName,
      unique: !!element.unique,
      isRequired: !!element.isRequired,
      showOnXlsxTemplate: !element.omitOnXlsxTemplate,
      readOnly: !!element.readOnly,
      isCore: core,
      kobo: element.kobo,
      ...(Object.prototype.hasOwnProperty.call(element, 'defaultValue')
        ? { defaultValue: element.defaultValue }
        : {}),
    };
    // ** Resource **
    if (element.type === 'resource' || element.type === 'resources') {
      if (element.relatedName) {
        validateGraphQLFieldName(element.relatedName, i18next);
        Object.assign(
          field,
          {
            resource: element.resource,
            displayField: element.displayField,
            relatedName: element.relatedName,
          },
          element.displayAsGrid && { displayAsGrid: element.displayAsGrid },
          element.canAddNew && { canAddNew: element.canAddNew },
          element.addTemplate && { addTemplate: element.addTemplate },
          element.gridFieldsSettings && {
            gridFieldsSettings: element.gridFieldsSettings,
          }
        );
      } else {
        throw new GraphQLError(
          i18next.t('utils.form.extractFields.errors.missingRelatedField', {
            name: element.valueName,
          })
        );
      }
    }
    // ** Multiple texts **
    if (field.type === 'multipletext') {
      Object.assign(field, {
        items: (element.items ?? []).map((x: MultipleTextItem) => {
          return {
            name: x.name,
            label: x.title ? x.title : x.name,
          };
        }),
      });
    }
    // ** Dynamic matrix **
    if (field.type === 'matrixdropdown') {
      Object.assign(field, {
        rows: (element.rows ?? []).map((x: RowItem | string) => {
          if (typeof x === 'string') {
            return { name: x, label: x };
          }
          return {
            name: x.value ? x.value : x,
            label: x.text ? x.text : x,
          };
        }),
        columns: (element.columns ?? []).map((x: ColumnItem) => {
          return {
            name: x.name,
            label: x.title,
            type: x.cellType ? x.cellType : element.cellType,
            choices: x.choices?.map((y: ChoiceItem | string) => {
              if (typeof y === 'string') {
                return { value: y, text: y };
              }
              return {
                value: y.value ? y.value : y,
                text: y.text ? y.text : y,
              };
            }),
          };
        }),
        choices: (element.choices ?? []).map((x: ChoiceItem | string) => {
          if (typeof x === 'string') {
            return { value: x, text: x };
          }
          return {
            value: x.value ? x.value : x,
            text: x.text ? x.text : x,
          };
        }),
      });
    }
    // ** Single choice matrix **
    if (field.type === 'matrix') {
      Object.assign(field, {
        rows: (element.rows ?? []).map((x: RowItem | string) => {
          if (typeof x === 'string') {
            return { name: x, label: x };
          }
          return {
            name: x.value ? x.value : x,
            label: x.text ? x.text : x,
          };
        }),
        columns: (element.columns ?? []).map((x: ColumnItem | string) => {
          if (typeof x === 'string') {
            return { name: x, label: x };
          }
          return {
            name: x.value ? x.value : x,
            label: x.text ? x.text : x,
          };
        }),
      });
    }
    // ** Dynamic rows matrix **
    if (field.type === 'matrixdynamic') {
      Object.assign(field, {
        columns: (element.columns ?? []).map((x: ColumnItem) => {
          return {
            name: x.name,
            type: x.cellType,
            label: x.title,
            choices: x.choices?.map((y: ChoiceItem | string) => {
              if (typeof y === 'string') {
                return { value: y, text: y };
              }
              return {
                value: y.value ? y.value : y,
                text: y.text ? y.text : y,
              };
            }),
          };
        }),
        choices: (element.choices ?? []).map((x: ChoiceItem | string) => {
          if (typeof x === 'string') {
            return { value: x, text: x };
          }
          return {
            value: x.value ? x.value : x,
            text: x.text ? x.text : x,
          };
        }),
      });
    }
    // ** Dropdown / Radio / Checkbox / Tagbox **
    if (
      field.type === 'dropdown' ||
      field.type === 'radiogroup' ||
      field.type === 'checkbox' ||
      field.type === 'tagbox'
    ) {
      if (element.choicesExpression) {
        // We can't save the choices in this case, just do nothing
      } else if (element.choicesByUrl) {
        const choicesByUrl =
          typeof element.choicesByUrl === 'string'
            ? { url: element.choicesByUrl }
            : element.choicesByUrl;
        Object.assign(field, {
          choicesByUrl: {
            url: choicesByUrl.url ? choicesByUrl.url : element.choicesByUrl,
            ...(choicesByUrl.path && {
              path: choicesByUrl.path,
            }),
            value: choicesByUrl.valueName ? choicesByUrl.valueName : 'name',
            text: choicesByUrl.titleName ? choicesByUrl.titleName : 'name',
            hasOther: element.hasOther,
            otherText: element.otherText ? element.otherText : 'Other',
          },
        });
      } else if (element.referenceData) {
        Object.assign(field, {
          referenceData: {
            id: element.referenceData,
            displayField: element.referenceDataDisplayField,
          },
        });
      } else {
        const choices = (element.choices ?? []).map(
          (x: ChoiceItem | string) => {
            if (typeof x === 'string') {
              return { value: x, text: x };
            }
            return {
              value: x.value || x,
              text: x.text || x.value || x,
            };
          }
        );
        if (element.hasOther) {
          Object.assign(field, {
            hasOther: true,
            otherText: element.otherText,
            otherPlaceHolder: element.otherPlaceHolder,
          });
          choices.push({
            value: 'other',
            text: element.otherText ? element.otherText : 'Other',
          });
        }
        Object.assign(field, {
          choices,
        });
      }
    }
    // ** Owner **
    if (field.type === 'owner') {
      Object.assign(field, { applications: element.applications });
    }
    // ** Comments **
    if (
      element.hasComment ||
      element.hasOther ||
      element.showCommentArea ||
      element.showOtherItem
    ) {
      fields.push({
        type: 'text',
        name: `${element.valueName}_comment`,
        isCore: core,
        generated: true,
      });
    }
    // ** Users **
    if (field.type === 'users') {
      Object.assign(field, { applications: element.applications });
    }
    // ** Geospatial **
    if (field.type === 'geospatial') {
      Object.assign(field, {
        geometry: element.geometry ?? 'Point',
      });
    }
    fields.push(field);
  }
};
