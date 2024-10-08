import {
  GraphQLObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';
import { AccessType, WorkflowType } from '.';
import { ContentEnumType } from '@const/enumTypes';
import { Workflow } from '@models';
import { AppAbility } from '@security/defineUserAbility';
import extendAbilityForStep from '@security/extendAbilityForStep';
import { accessibleBy } from '@casl/mongoose';

/** GraphQL Step type definition */
export const StepType = new GraphQLObjectType({
  name: 'Step',
  fields: () => ({
    id: {
      type: GraphQLID,
      resolve(parent) {
        return parent._id;
      },
    },
    name: { type: GraphQLString },
    icon: { type: GraphQLString },
    nextStepOnSave: { type: GraphQLBoolean },
    createdAt: { type: GraphQLString },
    modifiedAt: { type: GraphQLString },
    type: { type: ContentEnumType },
    content: { type: GraphQLID },
    // TODO: doesn't work
    permissions: {
      type: AccessType,
      resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        return ability.can('update', parent) ? parent.permissions : null;
      },
    },
    workflow: {
      type: WorkflowType,
      async resolve(parent, args, context) {
        const ability: AppAbility = context.user.ability;
        const workflow = await Workflow.findOne({
          steps: parent.id,
          ...accessibleBy(ability, 'read').Workflow,
        });
        return workflow;
      },
    },
    canSee: {
      type: GraphQLBoolean,
      async resolve(parent, args, context) {
        const ability = await extendAbilityForStep(context.user, parent);
        return ability.can('read', parent);
      },
    },
    canUpdate: {
      type: GraphQLBoolean,
      async resolve(parent, args, context) {
        const ability = await extendAbilityForStep(context.user, parent);
        return ability.can('update', parent);
      },
    },
    canDelete: {
      type: GraphQLBoolean,
      async resolve(parent, args, context) {
        const ability = await extendAbilityForStep(context.user, parent);
        return ability.can('delete', parent);
      },
    },
  }),
});
