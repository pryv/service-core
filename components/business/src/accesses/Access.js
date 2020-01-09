// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const treeUtils = require('components/utils/src/treeUtils');

import type AccessesRepository from './repository';
import type StreamsRepository from '../streams/Repository';

import type { Logger } from 'components/utils/src/logging';

import type { Stream, Action, ActionsSet } from 'components/business/src/streams';
import type { User } from 'components/business/src/users';

type Permission = {
  scope: {
    streamIds: Array<string>,
    tags?: Array<string>,
    fromTime?: number,
    toTime?: number,
  },
  actions: ActionSet,
};

type ActionCheck = (ActionSet) => boolean;

/**
 * key: streamId/tag
 * value: its scope action set
 */
type PermScopeMap = Map<string, ActionSet>;

class Access {
  id: string;

  permissions: Array<Permission>;

  created: ?number;
  createdBy: ?string;
  modified: ?number;
  modifiedBy: ?string;

  user: ?User;
  accessesRepository: ?AccessesRepository;
  streamsRepository: ?StreamsRepository;

  streamPermissions: ?Array<{}>;
  tagPermissions: ?Array<{}>;

  streamsTree: Array<Stream>;

  streamsScopeMap: PermScopeMap;
  tagsScopeMap: PermScopeMap;

  logger: Logger;

  constructor(params: {
    id?: string,
    created?: number,
    createdBy?: string,
    modified?: number,
    modifiedBy?: string,
    user?: User,
    permissions: Array<Permission>,
    accesssRepository?: AccessesRepository,
    streamsRepository?: StreamsRepository
  }) {
    this.id = params.id || cuid();
    this.created = params.created || Date.now() / 1000;
    this.createdBy = params.createdBy;
    this.modified = params.modified || Date.now() / 1000;
    this.modifiedBy = params.modifiedBy;
    this.user = params.user;
    this.permissions = params.permissions;
    this.accessesRepository = params.accesssRepository;
    this.streamsRepository = params.streamsRepository;
  }

  buildPermScopeMaps() {
    this.streamsScopeMap = new Map();
    this.tagsScopeMap = new Map();

    this.permissions.forEach(p => {
      const streamIds = p.scope.streamIds;
      const tags = p.scope.tags;
      if (streamIds != null) {
        streamIds.forEach(s => {
          this.streamsScopeMap.set(s, p.actions);
        });
      }
      if (tags != null) {
        tags.forEach(t => {
          this.tagsScopeMap.set(t, p.actions);
        });
      }
    });
  }

  /**
   * 1. retrieveStreams for user, applyInheritedProperties
   * 2. access.loadPermissions(streams);
   *  0. load sub-tree? probably not needed
   *  1. put scopes flat
   *  2. iterate on streams, applying actions on nodes of each stream
   * 3. build stream perms
   * 4. build tag perms
   */

  async loadPermissions() {
    this.buildPermScopeMaps();
    this.streamsTree = await this.streamsRepository.getAll(this.user);
    this.streamsScopeMap.forEach((actions, streamId) => {
      const stream = treeUtils.findById(this.streamsTree, streamId);
      if (stream == null) return;
      stream.actions = actions;
    });
  }

  canReadStream(stream: Stream): boolean {
    return this.canDoToStream(stream, hasReadAction);
  }
  canCreate(stream: Stream): boolean {
    return this.canDoToStream(stream, hasCreateAction);
  }
  canUpdateStream(stream: Stream): boolean {
    return this.canDoToStream(stream, hasUpdateAction);
  }
  canDeleteStream(stream: Stream): boolean {
    return this.canDoToStream(stream, hasDeleteAction);
  }

  canDoToStream(stream: Stream, check: ActionCheck): boolean {
    let targetStream: Stream = treeUtils.findById(this.streamsTree, stream.id);
    let loop = true;
    let hasRead = false;
    while (loop) {
      const actions = targetStream.actions;
      switch (actions) {
        case undefined:
          loop = true;
          targetStream = treeUtils.findById(
            this.streamsTree,
            targetStream.parentId
          );
          break;
        default:
          hasRead = check(actions.streams);
          loop = !hasRead && targetStream.parentId != null;
          targetStream = treeUtils.findById(
            this.streamsTree,
            targetStream.parentId
          );
          break;
      }
    }
    // TODO handle negative
    return hasRead;
  }

  async save(): Promise<void> {
    if (this.repository == null) {
      throw new Error('repository not set for Access object.');
    }
    await this.repository.insertOne(this.user, this);
  }

  async update(fieldsToUpdate: {}): Promise<void> {
    const fields = Object.keys(fieldsToUpdate);
    _.merge(this, fieldsToUpdate);
    await makeUpdate(fields, this);
  }

  async delete(): Promise<void> {
    if (this.repository == null) {
      throw new Error('repository not set for Access object.');
    }
    await this.repository.deleteOne(this.user, this.id);
  }

  forStorage(): {} {
    return _.pick(this, [
      'id',
      'accessId',
      'url',
      'state',
      'runCount',
      'failCount',
      'lastRun',
      'runs',
      'currentRetries',
      'maxRetries',
      'minIntervalMs',
      'created',
      'createdBy',
      'modified',
      'modifiedBy'
    ]);
  }

  forApi(): {} {
    return _.pick(this, [
      'id',
      'accessId',
      'url',
      'state',
      'runCount',
      'failCount',
      'lastRun',
      'runs',
      'currentRetries',
      'maxRetries',
      'minIntervalMs',
      'created',
      'createdBy',
      'modified',
      'modifiedBy'
    ]);
  }

  setLogger(logger: Logger): void {
    this.logger = logger;
  }
}
module.exports = Access;

function log(access: Access, msg: string): void {
  if (access.logger == null) return;
  access.logger.info(msg);
}

async function makeUpdate(fields?: Array<string>, access: Access): Promise<void> {
  if (access.repository == null) {
    throw new Error('repository not set for Access object.');
  }
  let update;

  if (fields == null) {
    update = access.forStorage();
  } else {
    update = _.pick(access.forStorage(), fields);
  }
  await access.repository.updateOne(access.user, update, access.id);
}

function hasReadAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf('read') >= 0;
}
function hasCreateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf('create') >= 0;
}
function hasUpdateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf('update') >= 0;
}
function hasDeleteAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf('delete') >= 0;
}
