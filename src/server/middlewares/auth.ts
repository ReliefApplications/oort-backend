import express from 'express';
import passport, { Strategy } from 'passport';
import { User, Client } from '@models';
import KeycloackBearerStrategy from 'passport-keycloak-bearer';
import { updateUser, userAuthCallback } from '@utils/user';
import config from 'config';
import session from 'express-session';
import { v4 as uuidv4 } from 'uuid';

/** Express application for the authorization middleware */
const authMiddleware = express();
authMiddleware.use(
  session({ secret: uuidv4(), resave: false, saveUninitialized: true })
);
authMiddleware.use(passport.initialize());
authMiddleware.use(passport.session());

/**
 * Keycloak Authentication credentials
 */
const credentials = {
  realm: config.get('auth.realm') as string,
  url: config.get('auth.url') as string,
  passReqToCallback: true,
};

passport.use(
  new KeycloackBearerStrategy(credentials, (req, token, done) => {
    // === USER ===
    if (token.name) {
      // Checks if user already exists in the DB
      User.findOne({ $or: [{ oid: token.sub }, { username: token.email }] })
        .populate({
          // Add to the user context all roles / permissions it has
          path: 'roles',
          model: 'Role',
          populate: {
            path: 'permissions',
            model: 'Permission',
          },
        })
        // .populate({
        //   path: 'groups',
        //   model: 'Group',
        // })
        .populate({
          // Add to the user context all positionAttributes with corresponding categories it has
          path: 'positionAttributes.category',
          model: 'PositionAttributeCategory',
        })
        .then((user) => {
          if (user) {
            // Returns the user if found
            // return done(null, user, token);
            if (!user.oid) {
              user.firstName = token.given_name;
              user.lastName = token.family_name;
              user.name = token.name;
              user.oid = token.sub;
              user.deleteAt = undefined; // deactivate the planned deletion
              updateUser(user).then(() => {
                user
                  .save()
                  .then(() => {
                    userAuthCallback(null, done, token, user);
                  })
                  .catch((err2) => {
                    userAuthCallback(err2, done, token, user);
                  });
              });
            } else {
              updateUser(user).then((changed) => {
                if (changed || !user.firstName || !user.lastName) {
                  if (!user.firstName) {
                    user.firstName = token.given_name;
                  }
                  if (!user.lastName) {
                    user.lastName = token.family_name;
                  }
                  user
                    .save()
                    .then(() => {
                      userAuthCallback(null, done, token, user);
                    })
                    .catch((err2) => {
                      userAuthCallback(err2, done, token, user);
                    });
                } else {
                  userAuthCallback(null, done, token, user);
                }
              });
            }
          } else {
            // Creates the user from azure oid if not found
            user = new User({
              firstName: token.given_name,
              lastName: token.family_name,
              username: token.email,
              name: token.name,
              oid: token.sub,
              roles: [],
              positionAttributes: [],
            });
            updateUser(user).then(() => {
              user
                .save()
                .then(() => {
                  userAuthCallback(null, done, token, user);
                })
                .catch((err2) => {
                  userAuthCallback(err2, done, token, user);
                });
            });
          }
        })
        .catch((err) => done(err));
    } else if (token.azp) {
      // === CLIENT ===
      // Checks if client already exists in the DB
      Client.findOne({
        clientId: token.azp,
      })
        .populate({
          // Add to the context all roles / permissions the client has
          path: 'roles',
          model: 'Role',
          populate: {
            path: 'permissions',
            model: 'Permission',
          },
        })
        .populate({
          // Add to the context all positionAttributes with corresponding categories
          path: 'positionAttributes.category',
          model: 'PositionAttributeCategory',
        })
        .then((client) => {
          if (client) {
            // Returns the client if found and add more information if first connection
            if (!client.clientId) {
              client.clientId = token.azp;
              client
                .save()
                .then((res) => done(null, res, token))
                .catch((error) => done(error));
            } else {
              return done(null, client, token);
            }
          } else {
            // Creates the client if doesn't exist
            client = new Client({
              name: token.azp,
              clientId: token.azp,
              roles: [],
              positionAttributes: [],
            });
            client
              .save()
              .then((res) => done(null, res, token))
              .catch((error) => done(error));
          }
        });
    } else {
      return done('error');
    }
  }) as Strategy
);

export { authMiddleware };
