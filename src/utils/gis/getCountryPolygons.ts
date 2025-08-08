import redis from '../../server/redis';
import { logger } from '@lib/logger';
import { ReferenceData } from '@models/referenceData.model';
import mongoose from 'mongoose';
import config from 'config';

/**
 * Get country polygons from common services.
 *
 * @returns mapping of polygons
 */
export const getAdmin0Polygons = async () => {
  const cacheKey = 'admin0:polygons';
  const client = await redis();
  const cacheData = client ? await client.get(cacheKey) : null;
  let admin0s: any[] = [];
  if (cacheData) {
    const referenceDataId = config.get<string>('admin0.referenceData');
    if (!referenceDataId) {
      return [];
    }
    const referenceData = await ReferenceData.findById(
      new mongoose.Types.ObjectId(referenceDataId)
    ).select('data');
    const countries = referenceData.data || [];
    const mapping = [];
    for (const country of countries) {
      if (country.geometry) {
        try {
          mapping.push({
            ...country,
            iso3: country.iso3_code,
            iso2: country.iso2_code,
            title_en: country.name,
          });
        } catch (err) {
          logger.error(
            `Failed to fetch admin0s for country ${country.iso3_code}: ${err.message}`
          );
        }
      }
    }
    if (client) {
      client.set(cacheKey, JSON.stringify(mapping), {
        EX: 60 * 60 * 1, // set a cache of one hour
      });
    }
    return mapping;
  } else {
    admin0s = JSON.parse(cacheData);
  }
  return admin0s;
};
