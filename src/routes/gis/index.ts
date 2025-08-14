import express from 'express';
import {
  GeometryType,
  ApiConfiguration,
  ReferenceData,
  Resource,
} from '@models';
import { buildQuery } from '@utils/query/queryBuilder';
import config from 'config';
import i18next from 'i18next';
import mongoose from 'mongoose';
import { logger } from '@lib/logger';
import axios from 'axios';
import { isEqual, get, omit } from 'lodash';
import turf, { Feature, booleanPointInPolygon } from '@turf/turf';
import dataSources, { CustomAPI } from '@server/apollo/dataSources';
import { getAdmin0Polygons } from '@utils/gis/getCountryPolygons';
import filterReferenceData from '@utils/referenceData/referenceDataFilter.util';
import * as shapefile from 'shapefile';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import {
  FilterDescriptor,
  CompositeFilterDescriptor,
} from '@const/compositeFilter';
import proj4 from 'proj4';

/**
 * Endpoint for custom feature layers
 */
const router = express.Router();

/**
 * Check geoJSON feature, if it's MultiLine or MultiPolygon, parse it
 * into array of single features
 *
 * @param feature Feature to parse
 * @returns array of features
 */
const parseToSingleFeature = (feature: Feature) => {
  const features: Feature[] = [];
  if (feature.geometry.type === 'MultiPoint') {
    for (const coordinates of feature.geometry.coordinates) {
      features.push({
        ...omit(feature, 'geometry'),
        geometry: {
          type: 'Point',
          coordinates: typeof coordinates !== 'number' ? coordinates : [],
        },
      });
    }
  } else if (feature.geometry.type === 'MultiPolygon') {
    features.push(feature);
  } else {
    // No other types are supported for now
    // features.push(feature);
  }
  return features;
};

/**
 * Clean properties of a feature, in order to remove whitespaces.
 *
 * @param props properties to clean
 * @returns cleaned properties
 */
const cleanProperties = (props) =>
  Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : value,
    ])
  );

/**
 * Transform geometry coordinates using proj4 transformation function
 *
 * @param geometry geometry to transform
 * @param transformFn transformation function
 * @returns transformed geometry
 */
function transformGeometry(geometry: any, transformFn: any): any {
  if (!geometry || !transformFn) return geometry;

  const transformCoordinate = (coord: number[]): number[] => {
    try {
      if (coord.length >= 2) {
        const [x, y] = transformFn.forward([coord[0], coord[1]]);
        return [x, y, ...coord.slice(2)]; // Preserve any additional dimensions (z, m)
      }
      return coord;
    } catch (error) {
      console.warn('Error transforming coordinate:', coord, error.message);
      return coord; // Return original if transformation fails
    }
  };

  const transformedGeometry = { ...geometry };

  switch (geometry.type) {
    case 'Point':
      transformedGeometry.coordinates = transformCoordinate(
        geometry.coordinates
      );
      break;

    case 'LineString':
    case 'MultiPoint':
      transformedGeometry.coordinates =
        geometry.coordinates.map(transformCoordinate);
      break;

    case 'Polygon':
    case 'MultiLineString':
      transformedGeometry.coordinates = geometry.coordinates.map(
        (ring: number[][]) => ring.map(transformCoordinate)
      );
      break;

    case 'MultiPolygon':
      transformedGeometry.coordinates = geometry.coordinates.map(
        (polygon: number[][][]) =>
          polygon.map((ring: number[][]) => ring.map(transformCoordinate))
      );
      break;

    default:
      console.warn(`Unsupported geometry type: ${geometry.type}`);
      return geometry;
  }

  return transformedGeometry;
}

/**
 * Check if the provided .prj file content is using the WGS84 coordinate reference system.
 *
 * @param prjContent - The content of the .prj file.
 * @returns True if the .prj file is using WGS84, false otherwise.
 */
const isWGS84 = (prjContent: string): boolean => {
  if (!prjContent) return false;
  const prj = prjContent.toUpperCase();
  return (
    prj.includes('WGS_1984') ||
    prj.includes('GEOGCS["WGS 84"') ||
    prj.includes('GEOGCS["WGS_1984"') ||
    prj.includes('EPSG:4326')
  );
};

/**
 * Get feature from item and add it to collection
 *
 * @param features collection of features
 * @param layerType layer type
 * @param item item to get feature from
 * @param mapping fields mapping, to build geoJson from
 * @param mapping.geoField geo field to extract geojson
 * @param mapping.latitudeField latitude field ( not used if geoField )
 * @param mapping.longitudeField longitude field ( not used if geoField )
 * @param mapping.adminField admin field ( mapping with polygons coming from common services )
 * @param mapping.propertyFilters any filters to be applies on the feature properties
 * @param geoFilter geo filter ( polygon )
 */
const getFeatureFromItem = (
  features: any[],
  layerType: GeometryType,
  item: any,
  mapping: {
    geoField?: string;
    latitudeField?: string;
    longitudeField?: string;
    adminField?: string;
    propertyFilters?: { prop: string; value: unknown }[];
  },
  geoFilter?: turf.Polygon
) => {
  const filterAndPush = (f: any) => {
    const hasFilters =
      mapping.propertyFilters && mapping.propertyFilters.length > 0;
    const allFiltersMet = mapping?.propertyFilters.every((propF) => {
      return f.properties?.[propF.prop] === propF.value;
    });

    if (!hasFilters || allFiltersMet) {
      features.push(f);
    }
  };
  if (mapping.geoField) {
    // removed the toLowerCase there, which may cause an issue
    const geo = get(item, mapping.geoField);
    if (geo) {
      if (
        !geoFilter ||
        booleanPointInPolygon(geo.geometry.coordinates, geoFilter)
      ) {
        if (mapping.adminField) {
          const feature = {
            geometry: geo,
            properties: { ...omit(item, mapping.geoField) },
          };
          filterAndPush(feature);
        } else {
          const feature = {
            ...(typeof geo === 'string' ? JSON.parse(geo) : geo),
            properties: { ...omit(item, mapping.geoField) },
          };
          // Only push if feature is of the same type as layer
          // Get from feature, as geo can be stored as string for some models ( ref data )
          // Helper function, uses layerType and filterAndPush from the outer scope
          const processSingleGeoJSONFeature = (feat: any) => {
            if (!feat || feat.type !== 'Feature') {
              return;
            }

            const featGeoType = get(feat, 'geometry.type');

            if (featGeoType === layerType) {
              filterAndPush(feat);
            } else if (featGeoType && `Multi${layerType}` === featGeoType) {
              parseToSingleFeature(feat as Feature).forEach(filterAndPush);
            }
          };

          if (feature.type === 'Feature') {
            processSingleGeoJSONFeature(feature);
          } else if (
            feature.type === 'FeatureCollection' &&
            feature.features &&
            Array.isArray(feature.features)
          ) {
            feature.features.forEach((f: any) => {
              processSingleGeoJSONFeature(f);
            });
          }
        }
      } else {
      }
    }
  } else {
    // Lowercase is needed as quick solution for solving ref data layers
    const latitude =
      get(item, mapping.latitudeField.toLowerCase()) ??
      get(item, mapping.latitudeField);
    const longitude =
      get(item, mapping.longitudeField.toLowerCase()) ??
      get(item, mapping.longitudeField);
    if (latitude && longitude) {
      const geo = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)],
        },
      };
      if (
        !geoFilter ||
        booleanPointInPolygon(geo.geometry.coordinates, geoFilter)
      ) {
        const feature = {
          ...geo,
          properties: { ...item },
        };
        filterAndPush(feature);
      }
    }
  }
};

/**
 * Get features
 *
 * @param features list of geo features
 * @param layerType type of layer
 * @param items list of items
 * @param mapping mapping
 */
const getFeatures = async (
  features: any[],
  layerType: GeometryType,
  items: any[],
  mapping: any
) => {
  items.forEach((item) => {
    try {
      getFeatureFromItem(features, layerType, item, mapping);
    } catch (err) {
      logger.error(err.message);
    }
  });
};

/**
 * Graphql query to fetch records from layouts and aggregations
 *
 * @param query gql query
 * @param variables parameters of the gql query
 * @param req original query
 * @param featureCollection Feature collection to populate
 * @param layerType Type of layer we are getting
 * @param mapping mapping used in aggregations
 * @returns error if fails, otherwise populates feature collection
 */
const gqlQuery = (
  query: any,
  variables: any,
  req: any,
  featureCollection: any,
  layerType: GeometryType,
  mapping: any
) =>
  axios({
    url: `${config.get('server.url')}/graphql`,
    method: 'POST',
    headers: {
      Authorization: req.headers.authorization,
      'Content-Type': 'application/json',
      ...(req.headers.accesstoken && {
        accesstoken: req.headers.accesstoken,
      }),
    },
    data: {
      query,
      variables,
    },
  }).then(async ({ data }) => {
    if (data.errors) {
      logger.error(data.errors[0].message);
    }
    try {
      for (const field in data.data) {
        if (Object.prototype.hasOwnProperty.call(data.data, field)) {
          if (data.data[field].items?.length > 0) {
            // Aggregation
            await getFeatures(
              featureCollection.features,
              layerType,
              data.data[field].items,
              mapping
            );
          } else if (data.data[field].edges?.length > 0) {
            // Query
            await getFeatures(
              featureCollection.features,
              layerType,
              data.data[field].edges.map((x) => x.node),
              mapping
            );
          }
        }
      }
    } catch (err) {
      throw new Error(err);
    }
  });

/**
 * Build endpoint
 *
 * @param req current http request
 * @param res http response
 * @returns GeoJSON feature collection mutations
 */
router.get('/feature', async (req, res) => {
  try {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const latitudeField = get(req, 'query.latitudeField');
    const longitudeField = get(req, 'query.longitudeField');
    const geoField = get(req, 'query.geoField');
    const adminField = get(req, 'query.adminField');
    const layerType = (get(req, 'query.type') ||
      GeometryType.POINT) as GeometryType;
    const contextFilters: CompositeFilterDescriptor = JSON.parse(
      get(req, 'query.contextFilters', null)
    );
    const graphQLVariables = JSON.parse(
      get(req, 'query.graphQLVariables', null)
    );

    // used to filter features by property values only
    const propertyFilters: { prop: string; value: unknown }[] = [];

    // @TODO: Add a proper way of defining the feature filters instead of using the context filters
    contextFilters?.filters.forEach((f: FilterDescriptor) => {
      const prop = (f.field || '').split('__FEATURE__.')[1];
      if (prop) {
        propertyFilters.push({
          prop,
          value: f.value,
        });
      }
    });
    const at = get(req, 'query.at') as string | undefined;
    if (!geoField && !(latitudeField && longitudeField)) {
      return res
        .status(400)
        .send(i18next.t('routes.gis.feature.errors.invalidFields'));
    }

    // Polygons are only supported for geoField
    if (layerType === GeometryType.POLYGON && !geoField) {
      return res
        .status(400)
        .send(i18next.t('routes.gis.feature.errors.missingPolygonGeoField'));
    }

    const mapping = {
      geoField,
      longitudeField,
      latitudeField,
      adminField,
      propertyFilters,
    };
    // Fetch resource to populate layer
    if (get(req, 'query.resource')) {
      let id: string;
      if (get(req, 'query.aggregation')) {
        id = get(req, 'query.aggregation') as string;
      } else if (get(req, 'query.layout')) {
        id = get(req, 'query.layout') as string;
      } else {
        return res.status(404).send(i18next.t('common.errors.dataNotFound'));
      }

      // todo(gis): improve how we find resource
      const resourceData = await Resource.findOne({
        $or: [
          {
            layouts: {
              $elemMatch: {
                _id: id,
              },
            },
          },
          {
            aggregations: {
              $elemMatch: {
                _id: id,
              },
            },
          },
        ],
      });

      if (!resourceData) {
        return res.status(404).send(i18next.t('common.errors.dataNotFound'));
      }

      let query: any;
      let variables: any;

      const aggregations = resourceData.aggregations || [];
      const aggregation = aggregations.find((x) => isEqual(x.id, id));
      const layouts = resourceData.layouts || [];
      const layout = layouts.find((x) => isEqual(x.id, id));

      // const filterPolygon = getFilterPolygon(req.query);

      if (aggregation) {
        query = `query recordsAggregation($resource: ID!, $aggregation: JSON!, $contextFilters: JSON, $first: Int, $at: Date) {
          recordsAggregation(resource: $resource, aggregation: $aggregation, contextFilters: $contextFilters, first: $first, at: $at)
        }`;
        variables = {
          resource: resourceData._id,
          aggregation: aggregation._id,
          contextFilters,
          first: 1000,
          at: at ? new Date(at) : undefined,
        };
      } else if (layout) {
        query = buildQuery(layout.query);
        variables = {
          first: 1000,
          filter: {
            logic: 'and',
            filters: contextFilters
              ? [layout.query.filter, contextFilters]
              : [layout.query.filter],
          },
          at: at ? new Date(at) : undefined,
        };
      } else {
        return res.status(404).send(i18next.t('common.errors.dataNotFound'));
      }
      await Promise.all([
        gqlQuery(query, variables, req, featureCollection, layerType, mapping),
      ]).catch((err) => {
        throw new Error(err);
      });
    } else if (get(req, 'query.refData')) {
      // Else, fetch reference data to populate layer
      const referenceData = await ReferenceData.findById(
        new mongoose.Types.ObjectId(get(req, 'query.refData') as string)
      );
      if (referenceData) {
        if (get(req, 'query.aggregation')) {
          const aggregation = get(req, 'query.aggregation') as string;
          const query = `query referenceDataAggregation(
            $referenceData: ID!
            $aggregation: JSON!
            $contextFilters: JSON
            $graphQLVariables: JSON
            $first: Int
            $at: Date
          ) {
              referenceDataAggregation(
                referenceData: $referenceData
                aggregation: $aggregation
                contextFilters: $contextFilters
                graphQLVariables: $graphQLVariables
                first: $first
                at: $at
              )
            }`;
          const variables = {
            referenceData: referenceData._id,
            aggregation: aggregation,
            contextFilters,
            graphQLVariables,
            first: 1000,
            at: at ? new Date(at) : undefined,
          };
          await Promise.all([
            gqlQuery(
              query,
              variables,
              req,
              featureCollection,
              layerType,
              mapping
            ),
          ]).catch((err) => {
            throw new Error(err);
          });
        } else if (referenceData.type === 'static') {
          let data = referenceData.data || [];
          if (contextFilters) {
            data = data.filter((x) => filterReferenceData(x, contextFilters));
          }
          await getFeatures(
            featureCollection.features,
            layerType,
            data,
            mapping
          );
        } else {
          const apiConfiguration = await ApiConfiguration.findById(
            referenceData.apiConfiguration,
            'name endpoint graphQLEndpoint'
          );
          const contextDataSources = (
            await dataSources({
              // Passing upstream request so accesstoken can be used for authentication
              req: req,
            } as any)
          )();
          const dataSource = contextDataSources[
            apiConfiguration.name
          ] as CustomAPI;
          let data: any =
            (await dataSource.getReferenceDataItems(
              referenceData,
              apiConfiguration,
              graphQLVariables
            )) || [];
          if (contextFilters) {
            data = data.filter((x) => filterReferenceData(x, contextFilters));
          }
          await getFeatures(
            featureCollection.features,
            layerType,
            data,
            mapping
          );
        }
      } else {
        return res.status(404).send(i18next.t('common.errors.dataNotFound'));
      }
    } else {
      return res.status(404).send(i18next.t('common.errors.dataNotFound'));
    }
    return res.send(featureCollection);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res
      .status(500)
      .send(i18next.t('routes.gis.feature.errors.unexpected'));
  }
});

router.get('/admin0', async (req, res) => {
  try {
    const polygons = await getAdmin0Polygons();
    return res.send(polygons);
  } catch (err) {
    logger.error(err.message, { stack: err.stack });
    return res
      .status(500)
      .send(i18next.t('routes.gis.feature.errors.unexpected'));
  }
});

router.post('/shapefile-to-geojson', async (req, res) => {
  try {
    const file = Array.isArray(req.files.file)
      ? req.files.file[0]
      : req.files.file;

    // Create a temporary directory
    const tempDir = path.join(Date.now().toString());
    fs.mkdirSync(tempDir, { recursive: true });

    // Extract the ZIP file
    const zip = new AdmZip(file.data);
    zip.extractAllTo(tempDir, true);

    // Find required files inside the extracted folder
    const shpFile = fs.readdirSync(tempDir).find((f) => f.endsWith('.shp'));
    const shxFile = fs.readdirSync(tempDir).find((f) => f.endsWith('.shx'));
    const dbfFile = fs.readdirSync(tempDir).find((f) => f.endsWith('.dbf'));
    const prjFile = fs.readdirSync(tempDir).find((f) => f.endsWith('.prj'));

    if (!shpFile || !shxFile || !dbfFile || !prjFile) {
      // Cleanup: Delete the extracted folder
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res
        .status(400)
        .send(i18next.t('routes.gis.shapefile.errors.format.shapefile'));
    }

    // Read and parse the shapefile
    const shpPath = path.join(tempDir, shpFile);
    const dbfPath = path.join(tempDir, dbfFile);
    const prjPath = path.join(tempDir, prjFile);

    const source = await shapefile.open(shpPath, dbfPath);

    // Read projection information if available
    let transformFunction = null;
    if (prjPath && fs.existsSync(prjPath)) {
      try {
        const prjContent = fs.readFileSync(prjPath, 'utf-8');
        if (!isWGS84(prjContent)) {
          throw new Error('Unsupported projection: WGS84');
        }
        transformFunction = proj4(prjContent.trim(), 'EPSG:4326');
      } catch (err) {
        return res
          .status(400)
          .send(
            i18next.t('routes.gis.shapefile.errors.format.missingPolygons')
          );
      }
    }

    const features = [];
    let result;
    while (!(result = await source.read()).done) {
      let geometry = result.value.geometry;

      // Transform geometry if we have a transformation function
      if (transformFunction && geometry) {
        geometry = transformGeometry(geometry, transformFunction);
      }

      features.push({
        type: 'Feature',
        geometry,
        properties: cleanProperties(result.value.properties),
      });
    }

    // Cleanup: Delete the extracted folder
    fs.rmSync(tempDir, { recursive: true, force: true });

    const zonations = features.map((f) => f.properties.Zonation);

    // Missing polygons
    if (features.length !== 3) {
      return res
        .status(400)
        .send(i18next.t('routes.gis.shapefile.errors.format.missingPolygons'));
    }

    // Missing zonations
    if (
      zonations.length !== 3 ||
      !['Buffer', 'Core', 'Transition'].every((z) =>
        features.some((f) => f.properties.Zonation === z)
      )
    ) {
      return res
        .status(400)
        .send(i18next.t('routes.gis.shapefile.errors.format.missingZonations'));
    }

    res.send({ geojson: { type: 'FeatureCollection', features } });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: i18next.t('routes.gis.shapefile.errors.processing'),
    });
  }
});

export default router;
