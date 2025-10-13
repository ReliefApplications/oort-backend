import { Role, User } from '@models';
import { checkIfRoleIsAssignedToUser } from '@utils/user/getAutoAssignedRoles';
import { uniqBy } from 'lodash';
import mongoose from 'mongoose';

/**
 * Return users meta resolver.
 *
 * @param field field definition.
 * @returns Users resolver.
 */
const getMetaUsersResolver = async (field: any) => {
  let users: User[] = [];
  if (field.applications && field.applications.length > 0) {
    const appObjectIds = field.applications.map(
      (x: string) => new mongoose.Types.ObjectId(x)
    );

    // Get users with manually assigned roles
    const aggregations = [
      // Left join
      {
        $lookup: {
          from: 'roles',
          localField: 'roles',
          foreignField: '_id',
          as: 'roles',
        },
      },
      // Replace the roles field with a filtered array, containing only roles that are part of the application(s).
      {
        $addFields: {
          roles: {
            $filter: {
              input: '$roles',
              as: 'role',
              cond: {
                $in: ['$$role.application', appObjectIds],
              },
            },
          },
        },
      },
      // Filter users that have at least one role in the application(s).
      { $match: { 'roles.0': { $exists: true } } },
    ];
    const manuallyAssignedUsers = await User.aggregate(aggregations);

    // Get users with auto assigned roles
    let autoAssignedUsers: User[] = [];
    const applicationAutoRoles = await Role.find({
      application: { $in: appObjectIds },
      autoAssignment: { $exists: true, $ne: [] },
    });
    if (applicationAutoRoles.length > 0) {
      // We must fetch users and check them against the rules in application code.
      // NOTE: This fetches all users, which could be a performance consideration for very large user bases.
      const allUsers = await User.find();
      autoAssignedUsers = allUsers.filter((user) =>
        applicationAutoRoles.some((role) =>
          checkIfRoleIsAssignedToUser(user, role)
        )
      );
    }
    users = uniqBy([...manuallyAssignedUsers, ...autoAssignedUsers], (user) =>
      user._id.toString()
    );
  } else {
    users = await User.find();
  }
  return Object.assign(field, {
    choices: (users
      ? users.map((x) => {
          // Extract display text
          let displayText = '';
          if (x.lastName && x.firstName) {
            displayText = [x.lastName, x.firstName].join(', ');
          } else if (x.name) {
            displayText = x.name;
          } else if (x.username) {
            displayText = x.username;
          } else {
            displayText = x._id;
          }

          return {
            text: displayText,
            value: x._id,
          };
        })
      : []
    ).concat({
      text: 'Current user',
      value: 'me',
    }),
  });
};

export default getMetaUsersResolver;
