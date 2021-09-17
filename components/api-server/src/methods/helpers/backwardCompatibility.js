/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//@flow

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const Stream = require('business/src/streams/Stream');
const Permission = require('business/src/accesses/Permission');
import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';
import type { StreamQueryWithStoreId } from 'business/src/events';
import type { GetEventsParams } from './eventsGetUtils';
import type Result from '../../Result';

const OLD_PREFIX: string = '.';

function changeMultipleStreamIdsPrefix(streamIds: Array<string>, toOldPrefix: boolean = true): Array<string> {
  const changeFunction: string => string = toOldPrefix ? replaceWithOldPrefix : replaceWithNewPrefix;

  const oldStyleStreamIds: Array<string> = [];
  for (const streamId of streamIds) {
    oldStyleStreamIds.push(changeFunction(streamId));
  }
  return oldStyleStreamIds;
}

function changePrefixIdForStreams(streams: Array<Stream>, toOldPrefix: boolean = true): Array<Stream> {
  const changeFunction: string => string = toOldPrefix ? replaceWithOldPrefix : replaceWithNewPrefix;

  for (const stream of streams) {
    stream.id = changeFunction(stream.id);
    if (stream.parentId != null) stream.parentId = changeFunction(stream.parentId);
  }
  return streams;
}

function replaceWithOldPrefix(streamId: string): string {
  if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
    return changeToOldPrefix(streamId);
  } else {
    return streamId;
  }

  function changeToOldPrefix(streamId: string): string {
    return OLD_PREFIX + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
  }
}

function replaceWithNewPrefix(streamId: string): string {
  const streamIdWithoutPrefix: string = removeOldPrefix(streamId);
  if (SystemStreamsSerializer.isCustomerSystemStreamId(streamIdWithoutPrefix)) return SystemStreamsSerializer.addCustomerPrefixToStreamId(streamIdWithoutPrefix);
  if (SystemStreamsSerializer.isPrivateSystemStreamId(streamIdWithoutPrefix)) return SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix);
  return streamIdWithoutPrefix;

  function removeOldPrefix(streamId: string): string {
    if (streamId.startsWith(OLD_PREFIX)) return streamId.substr(1);
    return streamId;
  }
}

function changeStreamIdsPrefixInStreamQuery(
  isStreamIdPrefixBackwardCompatibilityActive: boolean,
  context: MethodContext,
  params: GetEventsParams,
  result: Result,
  next: ApiCallback
): ?Function {
  if (! isStreamIdPrefixBackwardCompatibilityActive || context.disableBackwardCompatibility) return next();
  const streamsQueries: Array<StreamQueryWithStoreId> = params.arrayOfStreamQueriesWithStoreId;
  const oldStyleStreamsQueries: Array<StreamQueryWithStoreId> = [];
  for (const streamsQuery of streamsQueries) {
    const oldStyleStreamQuery = {};
    for (const [prop: string, streamIds: Array<string>] of Object.entries(streamsQuery)) {
      if (prop === 'storeId') {
        oldStyleStreamQuery[prop] = streamIds; // hack
      } else {
        oldStyleStreamQuery[prop] = changeMultipleStreamIdsPrefix(streamIds, false);
      }
    }
    oldStyleStreamsQueries.push(oldStyleStreamQuery);
  }
  params.arrayOfStreamQueriesWithStoreId = oldStyleStreamsQueries;
  next();
}

function changeStreamIdsInPermissions(permissions: Array<Permission>, toOldPrefix: boolean = true): Array<Permission> {
  const changeFunction: string => string = toOldPrefix ? replaceWithOldPrefix : replaceWithNewPrefix;
  const oldStylePermissions: Array<Permission> = [];

  for (const permission of permissions) {
    permission.streamId = changeFunction(permission.streamId);
    oldStylePermissions.push(permission);
  }
  return oldStylePermissions;
}

// double for loop

module.exports = {
  changeMultipleStreamIdsPrefix,
  changeStreamIdsPrefixInStreamQuery,
  changePrefixIdForStreams,
  replaceWithNewPrefix,
  changeStreamIdsInPermissions,
}