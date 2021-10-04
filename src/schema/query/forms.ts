import { GraphQLError, GraphQLInt, GraphQLID } from 'graphql';
import { FormType, Connection, encodeCursor, decodeCursor } from '../types';
import { Form } from '../../models';
import errors from '../../const/errors';
import { AppAbility } from '../../security/defineAbilityFor';

const DEFAULT_FIRST = 10;

export default {
    /*  List all forms available for the logged user.
        Throw GraphQL error if not logged.
    */
    type: Connection(FormType),
    args: {
        first: { type: GraphQLInt },
        afterCursor: { type: GraphQLID },
    },
    async resolve(parent, args, context) {
        // Authentication check
        const user = context.user;
        if (!user) { throw new GraphQLError(errors.userNotLogged); }

        const ability: AppAbility = context.user.ability;

        const abilityFilters = Form.accessibleBy(ability, 'read').getFilter();
        const filters: any[] = [abilityFilters];

        const first = args.first || DEFAULT_FIRST;
        const afterCursor = args.afterCursor;
        const cursorFilters = afterCursor ? {
                _id: {
                    $gt: decodeCursor(afterCursor),
                }
            } : {};

        let items: any[] = await Form.find({ $and: [cursorFilters, ...filters] })
            .limit(first + 1);

        const hasNextPage = items.length > first;
        if (hasNextPage) {
            items = items.slice(0, items.length - 1);
        }
        const edges = items.map(r => ({
            cursor: encodeCursor(r.id.toString()),
            node: r,
        }));
        return {
            pageInfo: {
                hasNextPage,
                startCursor: edges.length > 0 ? edges[0].cursor : null,
                endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null
            },
            edges,
            totalCount: await Form.countDocuments({ $and: filters })
        };
    },
}
