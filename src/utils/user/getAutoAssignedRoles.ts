import { difference, get, isEqual } from 'lodash';
import { Role, User } from '@models';
import config from 'config';

/**
 * Check if assignment rule works with user parameters
 *
 * @param filter assignment rule filter
 * @param user Current user
 * @returns true if filter matches
 */
export const checkIfRoleIsAssigned = (filter: any, user: User): boolean => {
  const roles = get(user, 'roles', []);
  const groupIds = get(user, 'groups', []);
  const userAttr = user.attributes ?? {};
  if (filter.logic) {
    // Composite filter descriptor
    switch (filter.logic) {
      case 'or': {
        return filter.filters.some((x) => checkIfRoleIsAssigned(x, user));
      }
      case 'and': {
        return filter.filters
          .map((x) => checkIfRoleIsAssigned(x, user))
          .every((x) => x === true);
      }
      default: {
        return false;
      }
    }
  }

  // filter descriptor
  if (filter.field === '{{groups}}') {
    // todo: check other versions of the code
    const value = (filter.value || []).filter((x) => x !== null);
    switch (filter.operator) {
      case 'eq': {
        return isEqual(
          groupIds.map((x) => x.toString()),
          value.map((x) => x.toString())
        );
      }
      case 'contains': {
        return (
          difference(
            value.map((x) => x.toString()),
            groupIds.map((x) => x.toString())
          ).length === 0
        );
      }
      default: {
        return false;
      }
    }
  }

  if (filter.field === '{{roles}}') {
    switch (filter.operator) {
      case 'isempty': {
        return roles.length === 0;
      }
      case 'isnotempty': {
        return roles.length > 0;
      }
      default: {
        return false;
      }
    }
  }

  const attrs =
    (config.get('user.attributes.list') as {
      value: string;
      text: string;
    }[]) || [];

  const attributes = attrs.map((x) => ({
    ...x,
    field: `{{attributes.${x.value}}}`,
  }));

  const attribute = attributes.find((x) => x.field === filter.field);
  if (attribute) {
    switch (filter.operator) {
      case 'eq': {
        return isEqual(userAttr[attribute.value], filter.value);
      }
      default: {
        return false;
      }
    }
  }

  return false;
};

/**
 * Check if assignment rule works with user parameters (optimized version for MongoDB filter generation)
 *
 * @param filter assignment rule filter
 * @param groupIds list of group ids
 * @param userAttr object of user attributes
 * @param roles list of user roles (optional, for {{roles}} filters)
 * @returns true if filter matches
 */
export const checkIfRoleIsAssignedWithParams = (
  filter: any,
  groupIds: string[],
  userAttr: { [key: string]: string },
  roles: any[] = []
): boolean => {
  if (filter.logic) {
    // Composite filter descriptor
    switch (filter.logic) {
      case 'or': {
        return filter.filters.some((x) =>
          checkIfRoleIsAssignedWithParams(x, groupIds, userAttr, roles)
        );
      }
      case 'and': {
        return filter.filters
          .map((x) =>
            checkIfRoleIsAssignedWithParams(x, groupIds, userAttr, roles)
          )
          .every((x) => x === true);
      }
      default: {
        return false;
      }
    }
  }

  // filter descriptor
  if (filter.field === '{{groups}}') {
    // todo: check other versions of the code
    const value = (filter.value || []).filter((x) => x !== null);
    switch (filter.operator) {
      case 'eq': {
        return isEqual(
          groupIds.map((x) => x.toString()),
          value.map((x) => x.toString())
        );
      }
      case 'contains': {
        return (
          difference(
            value.map((x) => x.toString()),
            groupIds.map((x) => x.toString())
          ).length === 0
        );
      }
      default: {
        return false;
      }
    }
  }

  if (filter.field === '{{roles}}') {
    switch (filter.operator) {
      case 'isempty': {
        return roles.length === 0;
      }
      case 'isnotempty': {
        return roles.length > 0;
      }
      default: {
        return false;
      }
    }
  }

  const attrs =
    (config.get('user.attributes.list') as {
      value: string;
      text: string;
    }[]) || [];

  const attributes = attrs.map((x) => ({
    ...x,
    field: `{{attributes.${x.value}}}`,
  }));

  const attribute = attributes.find((x) => x.field === filter.field);
  if (attribute) {
    switch (filter.operator) {
      case 'eq': {
        return isEqual(userAttr[attribute.value], filter.value);
      }
      default: {
        return false;
      }
    }
  }

  return false;
};

/**
 * Convert role assignment filter to MongoDB aggregation pipeline conditions
 * This allows filtering users directly in the database instead of fetching all users and checking in memory
 *
 * @param filter assignment rule filter
 * @returns MongoDB aggregation pipeline match condition
 */
export const convertRoleFilterToMongoQuery = (filter: any): any => {
  if (filter.logic) {
    // Composite filter descriptor
    switch (filter.logic) {
      case 'or': {
        return {
          $or: filter.filters.map((x) => convertRoleFilterToMongoQuery(x)),
        };
      }
      case 'and': {
        return {
          $and: filter.filters.map((x) => convertRoleFilterToMongoQuery(x)),
        };
      }
      default: {
        return {}; // Invalid logic, return empty filter
      }
    }
  }

  // Filter descriptor
  if (filter.field === '{{groups}}') {
    const value = (filter.value || []).filter((x) => x !== null);
    const stringValue = value.map((x) => x.toString());

    switch (filter.operator) {
      case 'eq': {
        // All groups must match exactly (same length and elements)
        return {
          $and: [
            { groups: { $size: stringValue.length } },
            { groups: { $all: stringValue } },
          ],
        };
      }
      case 'contains': {
        // User must have all specified groups (but can have more)
        return {
          groups: { $all: stringValue },
        };
      }
      default: {
        return {}; // Invalid operator
      }
    }
  }

  if (filter.field === '{{roles}}') {
    switch (filter.operator) {
      case 'isempty': {
        return {
          $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }],
        };
      }
      case 'isnotempty': {
        return {
          $and: [
            { roles: { $exists: true } },
            { roles: { $not: { $size: 0 } } },
          ],
        };
      }
      default: {
        return {}; // Invalid operator
      }
    }
  }

  // Handle user attributes
  const attrs =
    (config.get('user.attributes.list') as {
      value: string;
      text: string;
    }[]) || [];

  const attributes = attrs.map((x) => ({
    ...x,
    field: `{{attributes.${x.value}}}`,
  }));

  const attribute = attributes.find((x) => x.field === filter.field);
  if (attribute) {
    switch (filter.operator) {
      case 'eq': {
        return {
          [`attributes.${attribute.value}`]: filter.value,
        };
      }
      default: {
        return {}; // Invalid operator
      }
    }
  }

  return {}; // Unknown field
};

/**
 * Get users that match auto-assignment rules using MongoDB aggregation
 * This is more efficient than fetching all users and filtering in memory
 *
 * @param roles Array of roles with autoAssignment rules
 * @param additionalMatchConditions Additional match conditions to apply
 * @returns MongoDB aggregation pipeline
 */
export const getUsersMatchingAutoAssignmentRules = (
  roles: Role[],
  additionalMatchConditions: any = {}
): any[] => {
  // Build conditions for each role's auto-assignment rules
  const roleConditions = roles
    .filter((role) => role.autoAssignment && role.autoAssignment.length > 0)
    .map((role) => {
      // Each role can have multiple auto-assignment rules (OR condition between them)
      const assignmentConditions = role.autoAssignment
        .map((rule) => convertRoleFilterToMongoQuery(rule))
        .filter((condition) => Object.keys(condition).length > 0); // Remove empty conditions

      if (assignmentConditions.length === 0) return null;

      if (assignmentConditions.length === 1) {
        return assignmentConditions[0];
      }

      return { $or: assignmentConditions };
    })
    .filter((condition) => condition !== null);

  if (roleConditions.length === 0) {
    // No valid auto-assignment rules, return pipeline that matches no users
    return [{ $match: { _id: { $exists: false } } }];
  }

  // Users match if they satisfy ANY role's auto-assignment rules
  const autoAssignmentMatch =
    roleConditions.length === 1 ? roleConditions[0] : { $or: roleConditions };

  // Combine with additional match conditions
  const finalMatch =
    Object.keys(additionalMatchConditions).length > 0
      ? { $and: [autoAssignmentMatch, additionalMatchConditions] }
      : autoAssignmentMatch;

  return [{ $match: finalMatch }];
};

/**
 * Get MongoDB aggregation pipeline to find users with auto-assigned roles for a specific application
 *
 * @param applicationId The application ID to filter roles
 * @param additionalMatchConditions Additional match conditions to apply to users
 * @returns MongoDB aggregation pipeline
 */
export const getAutoAssignedUsersAggregation = async (
  applicationId: string,
  additionalMatchConditions: any = {}
): Promise<any[]> => {
  // Get roles with auto-assignment rules for this application
  const roles = await Role.find({
    application: applicationId,
    autoAssignment: { $exists: true, $ne: [] },
  });

  return getUsersMatchingAutoAssignmentRules(roles, additionalMatchConditions);
};

/**
 * Get MongoDB aggregation pipeline to find users with their roles concatenated with auto-assigned roles
 * This ensures users have both manually assigned roles and auto-assigned roles in their roles array
 *
 * @param applicationId The application ID to filter auto-assigned roles
 * @param additionalMatchConditions Additional match conditions to apply to users
 * @param includeAutoAssignedRoles Whether to include auto-assigned roles in the final roles array
 * @returns MongoDB aggregation pipeline that includes concatenated roles
 */
export const getUsersWithConcatenatedRoles = async (
  applicationId: string,
  additionalMatchConditions: any = {},
  includeAutoAssignedRoles = true
): Promise<any[]> => {
  // Get roles with auto-assignment rules for this application
  const autoAssignedRoles = await Role.find({
    application: applicationId,
    autoAssignment: { $exists: true, $ne: [] },
  });

  // Build the aggregation pipeline
  const pipeline: any[] = [];

  // First, apply basic matching conditions
  if (Object.keys(additionalMatchConditions).length > 0) {
    pipeline.push({ $match: additionalMatchConditions });
  }

  if (includeAutoAssignedRoles && autoAssignedRoles.length > 0) {
    // We'll compute auto-assigned roles in the application after fetching users
    // This is more practical than trying to do complex logic in MongoDB aggregation

    // Add a marker field to indicate we need to process auto-assigned roles
    pipeline.push({
      $addFields: {
        _needsAutoRoleProcessing: true,
        _applicationId: applicationId,
      },
    });
  }

  return pipeline;
};

/**
 * Process users returned from aggregation and add auto-assigned roles to their roles array
 * This function should be called after executing the aggregation pipeline
 *
 * @param users Array of users from the aggregation pipeline
 * @param applicationId The application ID to check auto-assigned roles for
 * @returns Array of users with concatenated roles
 */
export const processUsersWithAutoAssignedRoles = async (
  users: any[],
  applicationId: string
): Promise<any[]> => {
  // Get roles with auto-assignment rules for this application
  const autoAssignedRoles = await Role.find({
    application: applicationId,
    autoAssignment: { $exists: true, $ne: [] },
  });

  if (autoAssignedRoles.length === 0) {
    return users;
  }

  return users.map((user) => {
    // Check which auto-assigned roles this user qualifies for
    const userAutoAssignedRoles = autoAssignedRoles
      .filter((role) =>
        role.autoAssignment.some((rule) => checkIfRoleIsAssigned(rule, user))
      )
      .map((role) => role._id);

    // Concatenate existing roles with auto-assigned roles (removing duplicates)
    const existingRoles = user.roles || [];
    const allRoles = [
      ...new Set([
        ...existingRoles.map((r) => r.toString()),
        ...userAutoAssignedRoles.map((r) => r.toString()),
      ]),
    ];

    // Clean up processing markers
    const {
      _needsAutoRoleProcessing: needsAutoRoleProcessing,
      _applicationId: appId,
      ...cleanUser
    } = user;

    return {
      ...cleanUser,
      roles: allRoles,
      autoAssignedRoles: userAutoAssignedRoles, // Optional: keep track of which roles were auto-assigned
    };
  });
};

/**
 * Complete function that gets users with concatenated roles (manual + auto-assigned)
 * This combines the aggregation pipeline with post-processing
 *
 * @param applicationId The application ID to filter auto-assigned roles
 * @param additionalMatchConditions Additional match conditions to apply to users
 * @param includeAutoAssignedRoles Whether to include auto-assigned roles
 * @returns Promise of users with concatenated roles
 */
export const getUsersWithCompleteRoles = async (
  applicationId: string,
  additionalMatchConditions: any = {},
  includeAutoAssignedRoles = true
): Promise<any[]> => {
  // Get the aggregation pipeline
  const pipeline = await getUsersWithConcatenatedRoles(
    applicationId,
    additionalMatchConditions,
    includeAutoAssignedRoles
  );

  // Execute the aggregation
  const users = await User.aggregate(pipeline);

  // Process auto-assigned roles if needed
  if (includeAutoAssignedRoles) {
    return processUsersWithAutoAssignedRoles(users, applicationId);
  }

  return users;
};

/**
 * USAGE EXAMPLES:
 *
 * 1. Get users matching auto-assignment rules for a specific application:
 * ```typescript
 * const pipeline = await getAutoAssignedUsersAggregation(applicationId);
 * const users = await User.aggregate(pipeline);
 * ```
 *
 * 2. Find users matching auto-assignment rules with additional filters:
 * ```typescript
 * const additionalFilters = { username: { $regex: /john/i } };
 * const pipeline = await getAutoAssignedUsersAggregation(applicationId, additionalFilters);
 * const users = await User.aggregate(pipeline);
 * ```
 *
 * 3. Convert a single role assignment filter to MongoDB query:
 * ```typescript
 * const mongoQuery = convertRoleFilterToMongoQuery(assignmentRule);
 * const users = await User.find(mongoQuery);
 * ```
 *
 * 4. Get users with both manual and auto-assigned roles concatenated:
 * ```typescript
 * const users = await getUsersWithCompleteRoles(applicationId);
 * // Each user will have their roles array containing both manual and auto-assigned roles
 * ```
 *
 * 5. Get users with concatenated roles and additional filters:
 * ```typescript
 * const users = await getUsersWithCompleteRoles(
 *   applicationId,
 *   { username: { $regex: /admin/i } }
 * );
 * ```
 *
 * 6. Process users manually after aggregation:
 * ```typescript
 * const pipeline = await getUsersWithConcatenatedRoles(applicationId, { isActive: true });
 * const users = await User.aggregate(pipeline);
 * const processedUsers = await processUsersWithAutoAssignedRoles(users, applicationId);
 * ```
 *
 * 7. Get specific roles and build the aggregation manually:
 * ```typescript
 * const roles = await Role.find({
 *   application: applicationId,
 *   autoAssignment: { $exists: true, $ne: [] }
 * });
 * const pipeline = getUsersMatchingAutoAssignmentRules(roles, { isActive: true });
 * const users = await User.aggregate(pipeline);
 * ```
 */

/**
 * Get list of auto assigned roles for user
 *
 * @param user user to check
 * @returns list of auto assigned roles
 */
export const getAutoAssignedRoles = async (user: User): Promise<Role[]> => {
  const roles = await Role.find({
    autoAssignment: { $exists: true, $ne: [] },
  }).populate({
    path: 'permissions',
    model: 'Permission',
  });
  return roles.reduce((arr, role) => {
    if (role.autoAssignment.some((x) => checkIfRoleIsAssigned(x, user))) {
      arr.push(role);
    }
    return arr;
  }, []);
};

/**
 * Get list of auto assigned user
 *
 * @param user user to check
 * @param role role to check
 * @returns list of auto assigned roles
 */
export const checkIfRoleIsAssignedToUser = (
  user: User,
  role: Role
): boolean => {
  return role.autoAssignment.some((x) => checkIfRoleIsAssigned(x, user));
};
