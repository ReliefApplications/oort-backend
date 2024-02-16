import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
  GraphQLError,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { DashboardType } from '../types';
import { Dashboard, Page, Step } from '@models';
import extendAbilityForContent from '@security/extendAbilityForContent';
import { isEmpty, isNil } from 'lodash';
import { logger } from '@services/logger.service';
import ButtonActionInputType from '@schema/inputs/button-action.input';
import { graphQLAuthCheck } from '@schema/shared';
import { Types } from 'mongoose';
import { Context } from '@server/apollo/context';

type DashboardButtonArgs = {
  text: string;
  href: string;
  variant: string;
  category: string;
  openInNewTab: boolean;
};

type DashboardStatesArgs = {
  name: string;
  value: any;
  id: string;
};

/** Arguments for the editDashboard mutation */
type EditDashboardArgs = {
  id: string | Types.ObjectId;
  structure?: any;
  states?: DashboardStatesArgs[];
  name?: string;
  showFilter?: boolean;
  buttons?: DashboardButtonArgs[];
};

/**
 * Find dashboard from its id and update it, if user is authorized.
 * Throw an error if not logged or authorized, or arguments are invalid.
 */
export default {
  type: DashboardType,
  args: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    structure: { type: GraphQLJSON },
    states: { type: GraphQLJSON },
    name: { type: GraphQLString },
    showFilter: { type: GraphQLBoolean },
    buttons: { type: new GraphQLList(ButtonActionInputType) },
  },
  async resolve(parent, args: EditDashboardArgs, context: Context) {
    graphQLAuthCheck(context);
    try {
      const user = context.user;
      // check inputs
      if (!args || isEmpty(args)) {
        throw new GraphQLError(
          context.i18next.t('mutations.dashboard.edit.errors.invalidArguments')
        );
      }
      // get data
      let dashboard = await Dashboard.findById(args.id);
      // check permissions
      const ability = await extendAbilityForContent(user, dashboard);
      if (ability.cannot('update', dashboard)) {
        throw new GraphQLError(
          context.i18next.t('common.errors.permissionNotGranted')
        );
      }
      // do the update on dashboard
      const updateDashboard: {
        //modifiedAt?: Date;
        structure?: any;
        name?: string;
        showFilter?: boolean;
      } = {};
      Object.assign(
        updateDashboard,
        args.structure && { structure: args.structure },
        args.states && { states: args.states },
        args.name && { name: args.name },
        !isNil(args.showFilter) && { showFilter: args.showFilter },
        args.buttons && { buttons: args.buttons }
      );
      dashboard = await Dashboard.findByIdAndUpdate(args.id, updateDashboard, {
        new: true,
      });
      // update the related page or step
      const update = {
        modifiedAt: dashboard.modifiedAt,
        name: dashboard.name,
      };
      await Page.findOneAndUpdate({ content: dashboard.id }, update);
      await Step.findOneAndUpdate({ content: dashboard.id }, update);
      return dashboard;
    } catch (err) {
      logger.error(err.message, { stack: err.stack });
      if (err instanceof GraphQLError) {
        throw new GraphQLError(err.message);
      }
      throw new GraphQLError(
        context.i18next.t('common.errors.internalServerError')
      );
    }
  },
};
