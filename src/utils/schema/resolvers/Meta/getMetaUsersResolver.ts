import { User } from '@models';
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
                $in: [
                  '$$role.application',
                  field.applications.map((x) => new mongoose.Types.ObjectId(x)),
                ],
              },
            },
          },
        },
      },
      // Filter users that have at least one role in the application(s).
      { $match: { 'roles.0': { $exists: true } } },
    ];
    users = await User.aggregate(aggregations);
  } else {
    users = await User.find();
  }
  return Object.assign(field, {

    choices: (users
      ? users.map((x) => {
        // Create display text: "Last Name First Name"
        let displayText = '';
        if (x.lastName && x.firstName) {
          displayText = `${x.lastName} – ${x.firstName}`;
        } else if (x.name) {
          displayText = x.name;
        } else if (x.username) {
          displayText = x.username;
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
