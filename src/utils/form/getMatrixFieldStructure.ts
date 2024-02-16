import { result } from 'lodash';

/**
 * Function to get a survey structure with 1 field given it's name
 *
 * @param fieldName Field name
 * @returns The survey structure
 */
export const getMatrixFieldStructure = (
  fieldName: string,
  structure: any
): any => {
  let resultStructure: any = {};

  function traverse(structure: any) {
    if (structure && typeof structure === 'object') {
      if (structure.hasOwnProperty('name') && structure.name === fieldName) {
        resultStructure = structure;
      }

      for (const key in structure) {
        if (structure.hasOwnProperty(key)) {
          traverse(structure[key]);
        }
      }
    }
  }

  traverse(JSON.parse(structure ?? ''));

  return resultStructure;
};
