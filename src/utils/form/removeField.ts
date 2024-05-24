/**
 * Remove field from structure and depending on the field unique id and name passed.
 * Function by induction.
 *
 * @param structure structure of the form to edit
 * @param oid unique id of the field to search for
 * @param name name of the field
 * @returns {boolean} status of request.
 */
export const removeField = (
  structure: any,
  oid: string,
  name: string
): boolean => {
  // Loop on elements to find the right question
  if (structure.pages) {
    for (const page of structure.pages) {
      if (removeField(page, oid, name)) return true;
    }
  } else if (structure.elements) {
    for (const elementIndex in structure.elements) {
      const element = structure.elements[elementIndex];
      if (element.type === 'panel') {
        if (removeField(element, oid, name)) return true;
      } else {
        if (element.valueName === name) {
          // Remove from structure
          structure.elements.splice(elementIndex, 1);
          return true;
        }
      }
    }
  }
};
