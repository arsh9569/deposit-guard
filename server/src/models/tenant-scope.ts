import { Types, type FilterQuery } from 'mongoose';

/**
 * Adds a trusted institution boundary outside all caller filters. Callers must obtain
 * institutionId from authenticated server-side membership, never from the request body.
 */
export function institutionScopedFilter<T>(
  institutionId: string | Types.ObjectId,
  filter: FilterQuery<T> = {},
): FilterQuery<T> {
  if (typeof institutionId === 'string' && !/^[a-f\d]{24}$/i.test(institutionId)) {
    throw new TypeError('A valid server-resolved institution ID is required');
  }
  if (!Types.ObjectId.isValid(institutionId)) {
    throw new TypeError('A valid server-resolved institution ID is required');
  }
  return {
    $and: [{ institutionId: new Types.ObjectId(institutionId) }, filter],
  } as FilterQuery<T>;
}
