import { getNextQuestion } from './getNextQuestion';
import { getPreviousQuestion } from './getPreviousQuestion';
import { getQuestion } from './getQuestion';
import { getQuestionPosition } from './getQuestionPosition';

/**
 * Check if the structure is correct and add a new field. Use a passed structure to fetch the correct question.
 * The method tries to put the new question at the same place than in the template.
 * Function by induction.
 *
 * @param structure structure of the form to edit
 * @param oid unique id of the field to search for
 * @param name name of the field to search for
 * @param template structure of the core template
 */
export const addField = (
  structure: any,
  oid: string,
  name: string,
  template: any
): void => {
  const templateQuestion = getQuestion(template, oid, name);
  try {
    const templatePreviousQuestion = getPreviousQuestion(template, oid, name);
    const templateNextQuestion = getNextQuestion(template, oid);
    if (templatePreviousQuestion) {
      const { parent, index } = getQuestionPosition(
        structure,
        templatePreviousQuestion.name
      );
      if (parent) {
        parent.elements.splice(index + 1, 0, templateQuestion);
      } else {
        if (
          structure.pages &&
          structure.pages.length > 0 &&
          structure.pages[0].elements
        ) {
          structure.pages[0].elements.unshift(templateQuestion);
        }
      }
    } else if (templateNextQuestion) {
      const { parent, index } = getQuestionPosition(
        structure,
        templateNextQuestion.name
      );
      if (parent) {
        parent.elements.splice(index, 0, templateQuestion);
      } else {
        if (
          structure.pages &&
          structure.pages.length > 0 &&
          structure.pages[0].elements
        ) {
          structure.pages[0].elements.unshift(templateQuestion);
        }
      }
    } else {
      if (
        structure.pages &&
        structure.pages.length > 0 &&
        structure.pages[0].elements
      ) {
        structure.pages[0].elements.unshift(templateQuestion);
      }
    }
  } catch {
    if (
      structure.pages &&
      structure.pages.length > 0 &&
      structure.pages[0].elements
    ) {
      structure.pages[0].elements.unshift(templateQuestion);
    }
  }
};
