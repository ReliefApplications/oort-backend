import get from 'lodash/get';
import Handlebars from 'handlebars';
import dayjs from 'dayjs';
import { getRowsFromMeta } from '@utils/files';

Handlebars.registerHelper('html', function (value) {
  return new Handlebars.SafeString(value);
});

/**
 * Automatically transforms {{dataset}} to {{{dataset}}} so handlebars does not escape HTML
 * Example: {{dataset}}
 */
Handlebars.registerHelper('dataset', function () {
  return new Handlebars.SafeString(this.dataset || '');
});

/**
 * Formats date to a specific format, using dayjs
 * Example: {{dateFormat today "YYYY"}}
 */
Handlebars.registerHelper('dateFormat', function (date, format) {
  return dayjs(date).format(format);
});

/**
 * Allows date manipulation with dayjs, adding a specified amount of time to a date.
 * Example: {{dateAdd today 1 "days"}}
 * Can be combined with dateFormat to format the result.
 * Example: {{dateFormat (dateAdd today 1 "days") "YYYY-MM-DD"}}
 */
Handlebars.registerHelper('dateAdd', function (date, amount, unit) {
  return dayjs(date).add(amount, unit);
});

/**
 * Allows date manipulation with dayjs, subtracting a specified amount of time from a date.
 * Example: {{dateSubtract today 1 "days"}}
 * Can be combined with dateFormat to format the result.
 * Example: {{dateFormat (dateSubtract today 1 "days") "YYYY-MM-DD"}}
 */
Handlebars.registerHelper('dateSubtract', function (date, amount, unit) {
  return dayjs(date).subtract(amount, unit);
});

/**
 * Transforms stored dates into readable dates.
 *
 * @param fields list of fields.
 * @param items list of items.
 */
const convertDateFields = (fields: any[], items: any[]): void => {
  const dateFields = fields
    .filter((x) => ['Date', 'DateTime', 'Time'].includes(x.type))
    .map((x) => x.name);
  items.map((x) => {
    for (const key of Object.keys(x)) {
      if (dateFields.includes(key)) {
        x[key] = x[key] && new Date(x[key]);
      }
    }
  });
};

/**
 * Convert a computed row to html
 *
 * @param temp temp row to add
 * @returns html row
 */
const tempToHTML = (temp: any[]): string => {
  let htmlRow = '';
  if (temp.filter((x) => x).length > 0) {
    htmlRow = '<tr>';
    for (const value of temp) {
      htmlRow += `<td style="border: 1px solid black;">${value}</td>`;
    }
    htmlRow += '</tr>';
  }
  return htmlRow;
};

/**
 * Builds a row of the email to open.
 *
 * @param row dataset row
 * @param flatColumns flat columns list
 * @returns html row to include in table.
 */
const datasetRowToHTML = (row: any, flatColumns: any): string => {
  const temp = [];
  let maxFieldLength = 0;
  for (const field of flatColumns) {
    if (field.subTitle) {
      const value = get(row, field.field, []);
      maxFieldLength = Math.max(maxFieldLength, value.length);
      temp.push('');
    } else {
      temp.push(get(row, field.field, null) || '');
    }
  }
  let html = '';
  if (maxFieldLength > 0) {
    for (let i = 0; i < maxFieldLength; i++) {
      for (const field of flatColumns) {
        if (field.subTitle) {
          const value = get(row, field.field, []);
          if (value && value.length > 0) {
            temp[field.index] =
              get(get(row, field.field, null)[i], field.subField, null) || '';
          } else {
            temp[field.index] = '';
          }
        } else {
          if (i !== 0) {
            temp[field.index] = '';
          }
        }
      }
      html += tempToHTML(temp);
    }
  } else {
    html += tempToHTML(temp);
  }
  return html;
};

/**
 * Builds the body of the email to open.
 *
 * @param columns list of columns
 * @param rows list of rows
 * @returns html table to include in body of the email.
 */
const datasetToHTML = (columns: any[], rows: any[]): string => {
  let index = -1;
  const flatColumns = columns.reduce((acc, value) => {
    if (value.subColumns) {
      return acc.concat(
        value.subColumns.map((x) => {
          index += 1;
          return {
            name: value.name,
            title: value.title || value.name,
            subName: x.name,
            subTitle: x.title || x.name,
            field: value.field,
            subField: x.field,
            index,
          };
        })
      );
    } else {
      index += 1;
      return acc.concat({
        name: value.name,
        title: value.title || value.name,
        field: value.field,
        index,
      });
    }
  }, []);
  let table =
    '<table cellpadding="4" style="border-collapse: collapse; border: 1px solid black;">';
  // Add header
  table += '<tr>';
  for (const column of columns) {
    const colspan = column.subColumns?.length || 1;
    table += `<th colspan="${colspan}" style="background-color: #008dc9; color: white; text-align: center; border: 1px solid black${
      column.width ? `; width: ${column.width}px` : ''
    }"><b>`;
    table += column.title;
    table += '</b></th>';
  }
  table += '</tr>';
  // Add subheader
  const subHeaderColumns = flatColumns.map((x: any) => x.subTitle || '');
  if (subHeaderColumns.filter((x: string) => x).length > 0) {
    table += '<tr>';
    for (const column of subHeaderColumns) {
      table +=
        '<th style="background-color: #999999; text-align: center; border: 1px solid black;"><b>';
      table += column;
      table += '</b></th>';
    }
    table += '</tr>';
  }
  for (const row of rows) {
    table += datasetRowToHTML(row, flatColumns);
  }
  table += '</table>';
  return table;
};

/**
 * Converts dataset to HTML format for template processing.
 *
 * @param fields fields to convert.
 * @param rows rows to convert.
 * @returns HTML string representation of the dataset.
 */
const datasetExpression = (fields: any[], rows: any[]): string => {
  if (fields.length === 0 || rows.length === 0) {
    return '';
  }
  convertDateFields(fields, rows);
  return datasetToHTML(fields, rows);
};

/**
 * Converts record IDs to a comma-separated string.
 *
 * @param rows records to convert.
 * @returns comma-separated string of record IDs.
 */
const recordExpression = (rows: any[]) => {
  if (rows) {
    return rows
      .map((record: any) => record._id)
      .filter((x) => x)
      .join(', ');
  } else {
    return '';
  }
};

/**
 * Preprocesses text to replace keyword with corresponding data
 *
 * @param text text to preprocess.
 * @param dataset optional dataset settings.
 * @param user optional user object.
 * @param user.firstName User first name
 * @param user.lastName User last name
 * @param user.email User email
 * @returns preprocessed string.
 */
export const preprocess = (
  text: string,
  dataset: {
    fields: any[];
    rows: any[];
  } | null = null,
  user?: {
    firstName?: string;
    lastName?: string;
    email: string;
  }
): string => {
  const template = Handlebars.compile(text);

  // Convert data to a format that can be used in the template
  let data = {};
  if (dataset && dataset.rows[0]) {
    data = getRowsFromMeta(dataset.fields, [dataset.rows[0]])[0];
  }

  return template({
    today: new Date().toDateString(),
    now: new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    recordId: recordExpression(dataset?.rows || []),
    dataset: datasetExpression(dataset?.fields || [], dataset?.rows || []),
    data,
    user,
  });
};
