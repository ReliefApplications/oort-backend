import {
  CompositeFilterDescriptor,
  FilterDescriptor,
} from '@const/compositeFilter';

/**
 * Check if a filter is empty
 *
 * @param filter The filter to check
 * @returns A boolean indicating if the filter is empty
 */
export const isFilterEmpty = (
  filter: FilterDescriptor | CompositeFilterDescriptor | null
): boolean => {
  // Check if filter is null, undefined, or an empty object
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  // Type guard: check if this is a CompositeFilterDescriptor
  const isCompositeFilter = (
    f: FilterDescriptor | CompositeFilterDescriptor
  ): f is CompositeFilterDescriptor => {
    return 'filters' in f && Array.isArray(f.filters);
  };

  // Only process if it's a composite filter
  if (!isCompositeFilter(filter)) {
    // Simple filters (FilterDescriptor) are never empty - they have field, operator, value
    return false;
  }

  // Check if filter has a filters array that is empty
  if (filter.filters.length === 0) {
    return true;
  }

  // Check if all nested filters are empty (recursively)
  const allNestedEmpty = filter.filters.every(
    (nestedFilter: FilterDescriptor | CompositeFilterDescriptor) => {
      // If it's a composite filter, check recursively
      if (isCompositeFilter(nestedFilter)) {
        return isFilterEmpty(nestedFilter);
      }
      // Simple filters (FilterDescriptor) are never empty - they have field, operator, value
      return false;
    }
  );

  if (allNestedEmpty) {
    return true;
  }

  return false;
};
