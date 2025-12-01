import { AppAbility } from '@security/defineUserAbility';
import extendAbilityForRecords from '@security/extendAbilityForRecords';
import extendAbilityForContent from '@security/extendAbilityForContent';
import { Form, Resource, User } from '@models';

type AbilityCache = {
  records: Record<string, Promise<AppAbility>>;
  formContent: Record<string, Promise<AppAbility>>;
};

type ContextWithAbilityCache = {
  _abilityCache?: AbilityCache;
  user: User & {
    ability: AppAbility;
  };
};

const getOrCreateAbilityCache = (
  context: ContextWithAbilityCache
): AbilityCache => {
  if (!context._abilityCache) {
    context._abilityCache = {
      records: {},
      formContent: {},
    };
  }
  return context._abilityCache;
};

const getObjectId = (obj: Form | Resource): string => {
  const anyObj = obj as any;
  return anyObj.id ?? anyObj._id?.toString();
};

/**
 * Returns a cached records ability for a form or resource for a single GraphQL request context.
 */
export const getCachedRecordsAbility = async (
  context: any,
  onObject: Form | Resource
): Promise<AppAbility> => {
  const ctx = context as ContextWithAbilityCache;
  const cache = getOrCreateAbilityCache(ctx);
  const key = `records:${getObjectId(onObject)}`;

  if (!cache.records[key]) {
    cache.records[key] = extendAbilityForRecords(ctx.user, onObject as any);
  }

  return cache.records[key];
};

/**
 * Returns a cached content ability for a given form for a single GraphQL request context.
 */
export const getCachedFormContentAbility = async (
  context: any,
  form: Form
): Promise<AppAbility> => {
  const ctx = context as ContextWithAbilityCache;
  const cache = getOrCreateAbilityCache(ctx);
  const key = `formContent:${getObjectId(form)}`;

  if (!cache.formContent[key]) {
    cache.formContent[key] = extendAbilityForContent(ctx.user, form);
  }

  return cache.formContent[key];
};
