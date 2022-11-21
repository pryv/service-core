/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { tryCoerceStringValues } = require('api-server').validation;

const lodash = require('lodash');
const timestamp = require('unix-timestamp');

const errors = require('errors').factory;

const SeriesResponse = require('../SeriesResponse');

const AUTH_HEADER = 'authorization';

import type { Query, Repository } from 'business';
import type { MetadataRepository, SeriesMetadata } from '../../metadata_cache';
import type Context from '../../context';

/** GET /events/:event_id/series - Query a series for a data subset.
 *
 * @param  {type} ctx:  Context
 * @param  {type} req:  express$Request       description
 * @param  {type} res:  express$Response      description
 * @param  {type} next: express$NextFunction  description
 * @return {void}
 */
async function querySeriesData(
  ctx: Context,
  req: express$Request,
  res: express$Response
): unknown {
  const metadata = ctx.metadata;
  const seriesRepo = ctx.series;

  // Extract parameters from request:
  const username = req.params.user_name;
  const eventId = req.params.event_id;
  const accessToken: string | undefined | null = req.headers[AUTH_HEADER];

  // If required params are not there, abort.
  if (accessToken == null) throw errors.missingHeader(AUTH_HEADER, 401);
  if (eventId == null) throw errors.invalidItemId();

  const seriesMeta = await verifyAccess(
    username,
    eventId,
    accessToken,
    metadata
  );

  const query = coerceStringParams(lodash.clone(req.query));
  applyDefaultValues(query);
  validateQuery(query);

  await retrievePoints(seriesRepo, res, query, seriesMeta);
}

function coerceStringParams(params: any): Query {
  tryCoerceStringValues(params, {
    fromDeltaTime: 'number',
    toDeltaTime: 'number',
  });

  const query = {
    from: params.fromDeltaTime,
    to: params.toDeltaTime,
  };

  return query;
}

function applyDefaultValues(query: any) {
  if (query.to == null) query.to = timestamp.now();
}

function validateQuery(query: Query) {
  if (query.from != null && isNaN(query.from))
    throw errors.invalidParametersFormat(
      "'from' must contain seconds since epoch."
    );

  if (isNaN(query.to))
    throw errors.invalidParametersFormat(
      "'to' must contain seconds since epoch."
    );

  if (query.from != null && query.to != null && query.to < query.from)
    throw errors.invalidParametersFormat("'to' must be >= 'from'.");
}

async function verifyAccess(
  username: string,
  eventId: string,
  authToken: string,
  metadata: MetadataRepository
): Promise<SeriesMetadata> {
  const seriesMeta = await metadata.forSeries(username, eventId, authToken);

  if (!seriesMeta.canRead()) throw errors.forbidden();

  return seriesMeta;
}

async function retrievePoints(
  seriesRepo: Repository,
  res: express$Response,
  query: Query,
  seriesMeta: SeriesMetadata
): Promise<void> {
  const seriesInstance = await seriesRepo.get(...seriesMeta.namespaceAndName());
  const data = await seriesInstance.query(query);

  const responseObj = new SeriesResponse(data);
  responseObj.answer(res);
}

module.exports = querySeriesData;
