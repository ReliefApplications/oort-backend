import redis from '../../server/redis';
import { logger } from '@lib/logger';
import axios from 'axios';
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
  if (!cacheData) {
    const token = config.get('unescoCountriesApi.token');
    const parseJSON = (json: string) => {
      return json
        ? JSON.parse(
            json.replace(/(?<!\w)'|'(?!\w)/g, '"').replace(',]}', ']}')
          )
        : {};
    };
    admin0s = await axios({
      url: config.get('unescoCountriesApi.endpoint'),
      method: 'get',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(({ data }) => {
        const mapping = [];
        for (const country of data.data) {
          try {
            mapping.push({
              ...country.attributes,
              id: country.id,
              coordinates: parseJSON(country.attributes.coordinates),
              geometry: parseJSON(country.attributes.geometry),
            });
          } catch (err) {
            logger.error(
              `Failed to fetch admin0s for country ${
                country.attributes.iso3
              }: ${err.message} \n ${JSON.stringify(country)}`
            );
          }
        }
        if (client) {
          client.set(cacheKey, JSON.stringify(mapping), {
            EX: 60 * 60 * 1, // set a cache of one hour
          });
        }
        return mapping;
      })
      .catch((err) => {
        logger.error(`Failed to fetch admin0s: ${err.message}`);
        return [];
      });
  } else {
    admin0s = JSON.parse(cacheData);
  }
  return admin0s;
};
