import { GraphQLError } from 'graphql/error';
import getType from './getType';
import errors from '../const/errors';

/*  Push in fields array all detected fields in the json structure of object.
    Function by induction.
*/
async function extractFields(object, fields) {
    if (object.elements) {
        for (const element of object.elements) {
            if (element.type === 'panel') {
                await extractFields(element, fields);
            } else {
                if (!element.valueName) {
                    throw new GraphQLError(errors.missingDataField);
                }
                const type = await getType(element);
                fields.push({
                    type,
                    name: element.valueName,
                    isRequired: element.isRequired ? element.isRequired : false,
                    resource: element.type === 'resource' ? element.resource : null,
                    displayField: element.type === 'resource' ? element.displayField : null
                });
            }
        }
    }
}

export default extractFields;