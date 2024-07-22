/**
 * Gets the previous question, from a question unique id.
 *
 * @param structure parent structure.
 * @param oid question unique id.
 * @param name question name.
 * @returns Previous question if exists.
 */
export const getPreviousQuestion = (
  structure: any,
  oid: string,
  name: string
): any => {
  if (structure.pages) {
    for (const page of structure.pages) {
      const question = getPreviousQuestion(page, oid, name);
      if (question) return question;
    }
  } else if (structure.elements) {
    for (const elementIndex in structure.elements) {
      const element = structure.elements[elementIndex];
      if (element.type === 'panel') {
        if (element.oid === oid) return element;
        const question = getPreviousQuestion(element, oid, name);
        if (question) return question;
      } else {
        if (element.valueName === name) {
          // Return previous question
          if (Number(elementIndex) - 1 >= 0) {
            return structure.elements[Number(elementIndex) - 1];
          } else {
            return null;
          }
        }
      }
    }
  }
};
