/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//@flow

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

import type { Event } from 'business/src/events';
import type { Stream } from 'business/src/streams';
import type { Permission } from 'business/src/accesses';
import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';
import type { StreamQueryWithStoreId } from 'business/src/events';
import type { GetEventsParams } from './eventsGetUtils';
import type Result from '../../Result';

const OLD_PREFIX: string = '.';
const TAG_ROOT_STREAMID: string = 'tags-migrated';
const TAG_PREFIX: string = 'tag-migrated-';
const TAG_PREFIX_LENGTH: number = TAG_PREFIX.length;

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

/**
 * extract tags from streamIds with tag prefix
 */
function findTagsInStreamIds(streamIds: Array<string>): Array<string> {
  const tags = [];
  for (const streamId of streamIds) {
    if (isTagStreamId(streamId)) tags.push(removeTagPrefix(streamId))
  }
  return tags;
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
  // if (event.tags != null) console.log('WOW, should not have anymore tags in the storage');
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
  findTagsInStreamIds,
  replaceTagsWithStreamIds,
  putOldTags,
}