import i18next from 'i18next';
import { graphqlMiddleware } from '../middlewares';
import { GraphQLError } from 'graphql';
import { Context } from 'graphql-ws';
import { IncomingMessage } from 'http';

/**
 * Gets the middleware function promise
 *
 * @param ctx Context object
 * @returns middleware function promise
 */
export default (ctx: Context) => {
  const { connectionParams } = ctx;
  const authParams =
    connectionParams && typeof connectionParams === 'object'
      ? (connectionParams as Record<string, unknown>)
      : null;
  const rawToken =
    authParams?.authToken ??
    authParams?.authorization ??
    authParams?.Authorization;
  const authToken =
    typeof rawToken === 'string'
      ? rawToken.replace(/^Bearer\s+/i, '').trim()
      : '';

  // Check if request is present in the extra object
  if (
    authToken &&
    typeof ctx.extra === 'object' &&
    'request' in ctx.extra &&
    ctx.extra.request instanceof IncomingMessage
  ) {
    const request = ctx.extra.request;
    request.headers.authorization = `Bearer ${authToken}`;
    return new Promise((res) => {
      graphqlMiddleware(request, {} as any, () => {
        res(request);
      });
    });
  }

  throw new GraphQLError(
    i18next.t('common.errors.authenticationTokenNotFound'),
    {
      extensions: {
        code: 'UNAUTHENTICATED',
      },
    }
  );
};
