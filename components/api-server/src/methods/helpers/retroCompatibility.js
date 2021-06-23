/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//@flow

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const Stream = require('business/src/streams/Stream');
const StreamsQuery = require('business/src/streams/StreamsQuery');
import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

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

function changeStreamIdsPrefixInStreamQuery(context: MethodContext, params: mixed, result: Result, next: ApiCallback): void {
  const streamsQueries: Array<StreamsQuery> = params.streams;
  const oldStyleStreamsQueries: Array<StreamsQuery> = [];
  for (const streamsQuery of streamsQueries) {
    const oldStyleStreamQuery = {};
    for (const [prop, streamIds] of Object.entries(streamsQuery)) {
      if (prop === 'storeId') {
        oldStyleStreamQuery[prop] = streamIds; // hack
      } else {
        oldStyleStreamQuery[prop] = changeMultipleStreamIdsPrefix(streamIds, false);
      }
    }
    oldStyleStreamsQueries.push(oldStyleStreamQuery);
  }
  params.streams = oldStyleStreamsQueries;
  next();
}

// double for loop

module.exports = {
  changeMultipleStreamIdsPrefix,
  changeStreamIdsPrefixInStreamQuery,
  changePrefixIdForStreams,
  replaceWithNewPrefix,
}