/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//@flow

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getConfigUnsafe } = require('@pryv/boiler');

import type { Event } from 'business/src/events';
import type { Stream } from 'business/src/streams';
import type { Permission } from 'business/src/accesses';
import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';
import type { StreamQueryWithStoreId } from 'business/src/events';
import type { GetEventsParams } from './eventsGetUtils';
import type Result from '../../Result';

const OLD_PREFIX: string = '.';

// loaded lazily from config using loadTagConfigIfNeeded()
let TAG_ROOT_STREAMID: ?string;
let TAG_PREFIX: ?string;
let TAG_PREFIX_LENGTH: ?number;
let isTagBackwardCompatibilityActive: ?boolean;

loadTagConfigIfNeeded();

function loadTagConfigIfNeeded(): void {
  if (TAG_PREFIX != null) return; // only testing this one as all 3 values are set together
  const config = getConfigUnsafe(true);
  TAG_PREFIX = config.get('backwardCompatibility:tags:streamIdPrefix');
  TAG_ROOT_STREAMID = config.get('backwardCompatibility:tags:rootStreamId');
  TAG_PREFIX_LENGTH = TAG_PREFIX.length;
  isTagBackwardCompatibilityActive = config.get('backwardCompatibility:tags:isActive');
}

function convertStreamIdsToOldPrefixOnResult(event: Event) {
  let count = 0;
  if (event.streamIds == null) return;
  const newStreamIds = event.streamIds.map((streamId) => {
    if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
      count++;
      return changeToOldPrefix(streamId);
    }
  });
  if (count > 0) { // we cannot ensure integrity
    delete event.integrity;
    event.streamIds = newStreamIds;
  }
}

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
    if (stream.children?.length > 0) changePrefixIdForStreams(stream.children, toOldPrefix);
  }
  return streams;
}

function replaceWithOldPrefix(streamId: string): string {
  if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
    return changeToOldPrefix(streamId);
  } else {
    return streamId;
  }
}

function changeToOldPrefix(streamId: string): string {
  return OLD_PREFIX + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
}

function replaceWithNewPrefix(streamId: string): string {
  if (! streamId.startsWith(OLD_PREFIX)) return streamId;
  const streamIdWithoutPrefix: string = removeOldPrefix(streamId);
  if (SystemStreamsSerializer.isCustomerSystemStreamId(streamIdWithoutPrefix)) return SystemStreamsSerializer.addCustomerPrefixToStreamId(streamIdWithoutPrefix);
  if (SystemStreamsSerializer.isPrivateSystemStreamId(streamIdWithoutPrefix)) return SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix);
  return streamIdWithoutPrefix;

  function removeOldPrefix(streamId: string): string {
    if (streamId.startsWith(OLD_PREFIX)) return streamId.substr(OLD_PREFIX.length);
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
    if (permission.streamId != null) { // do not change "feature" permissions
      permission.streamId = changeFunction(permission.streamId);
    }
    oldStylePermissions.push(permission);
  }
  return oldStylePermissions;
}

/**
 * Replaces the tags in an event with streamIds with the corresponding prefix
 * Deletes the tags.
 */
function replaceTagsWithStreamIds(event: Event): Event {
  if (event.tags == null) return event;
  for (const tag: string of event.tags) {
    event.streamIds.push(TAG_PREFIX + tag);
  }
  delete event.tags;
  return event;
}

/**
 * put back tags in events, taken from its streamIds
 */
function putOldTags(event: Event): Event {
  event.tags = [];
  for (const streamId: string of event.streamIds) {
    if (isTagStreamId(streamId)) {
      event.tags.push(removeTagPrefix(streamId));
    }
  }
  return event;
}

function removeTagPrefix(streamId: string): string {
  return streamId.slice(TAG_PREFIX_LENGTH);
}

function isTagStreamId(streamId: string): boolean {
  return streamId.startsWith(TAG_PREFIX);
}

module.exports = {
  changeMultipleStreamIdsPrefix,
  changeStreamIdsPrefixInStreamQuery,
  changePrefixIdForStreams,
  replaceWithNewPrefix,
  changeStreamIdsInPermissions,
  TAG_ROOT_STREAMID,
  TAG_PREFIX,
  replaceTagsWithStreamIds,
  putOldTags,
  convertStreamIdsToOldPrefixOnResult,
}
