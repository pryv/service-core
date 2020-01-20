// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const treeUtils = require('components/utils/src/treeUtils');
const Actions = require('components/business/src/streams/types').Actions;

import type AccessesRepository from './repository';
import type StreamsRepository from '../streams/Repository';

import type { Logger } from 'components/utils/src/logging';

import type { Stream, Action, ActionSet } from 'components/business/src/streams';
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

  starStreamActions: ActionSet;

  streamPermissions: ?Array<{}>;
  tagPermissions: ?Array<{}>;

  streamsTree: Array<Stream>;

  readableStreams: Array<Stream>;

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

    const starStreamActions: ActionSet = this.streamsScopeMap.get('*');
    if (starStreamActions != null) {
      this.starStreamActions = starStreamActions;
    }
  }

  hasStarStreamPerm() {
    return this.starStreamActions != null;
  }

  async loadPermissions() {
    this.buildPermScopeMaps();
    this.streamsTree = await this.streamsRepository.getAll(this.user);
    this.streamsScopeMap.forEach((actions, streamId) => {
      const stream = treeUtils.findById(this.streamsTree, streamId);
      if (stream == null) return;
      stream.actions = actions;
    });
  }

  buildReadableStreams(): void {
    const streamsTree = this.streamsTree;
    this.readableStreams = treeUtils.filterTree(streamsTree, true, s => {
      return this.canReadStream(s);
    });
  }

  getReadableStreams(): Array<Stream> {
    if (this.readableStreams == null) {
      this.buildReadableStreams();
    }
    return this.readableStreams;
  }

  canReadEvent(stream: Stream): boolean {
    return this.canDoToResource(stream, 'events', hasReadAction, hasNonReadAction);
  }
  canCreateEvent(stream: Stream): boolean {
    return this.canDoToResource(stream, 'events', hasCreateAction, hasNonCreateAction);
  }
  canUpdateEvent(stream: Stream): boolean {
    return this.canDoToResource(stream, 'events', hasUpdateAction, hasNonUpdateAction);
  }
  canDeleteEvent(stream: Stream): boolean {
    return this.canDoToResource(stream, 'events', hasDeleteAction, hasNonDeleteAction);
  }
  canReadStream(stream: Stream): boolean {
    return this.canDoToResource(stream, 'streams', hasReadAction, hasNonReadAction);
  }
  canCreateStream(stream: Stream): boolean {
    return this.canDoToResource(stream, 'streams', hasCreateAction, hasNonCreateAction);
  }
  canUpdateStream(stream: Stream): boolean {
    return this.canDoToResource(stream, 'streams', hasUpdateAction, hasNonUpdateAction);
  }
  canDeleteStream(stream: Stream): boolean {
    return this.canDoToResource(stream, 'streams', hasDeleteAction, hasNonDeleteAction);
  }

  canDoToResource(stream: Stream, resource: string, check: ActionCheck, nonCheck: ActionCheck): boolean {

    // case *
    if (this.hasStarStreamPerm() && check(this.starStreamActions[resource])) return true;

    // normal case
    let targetStream: Stream = treeUtils.findById(this.streamsTree, stream.id);
    let loop = true;
    let hasRead = false;
    let hasNonRead = false;
    while (loop) {
      const actions = targetStream.actions;
      if (actions == null) {
        loop = true;
        targetStream = treeUtils.findById(
          this.streamsTree,
          targetStream.parentId
        );
      } else {
        hasRead = check(actions[resource]);
        hasNonRead = nonCheck(actions[resource]);
        loop = !hasNonRead && !hasRead && targetStream.parentId != null;
        targetStream = treeUtils.findById(
          this.streamsTree,
          targetStream.parentId
        );
      }
    }
    return hasRead;

  }

  hasTags(): boolean {
    return this.tagsScopeMap.size > 0;
  }

  async save(): Promise<void> {
    if (this.accessesRepository == null) {
      throw new Error('repository not set for Access object.');
    }
    await this.accessesRepository.insertOne(this.user, this);
  }

  async update(fieldsToUpdate: {}): Promise<void> {
    const fields = Object.keys(fieldsToUpdate);
    _.merge(this, fieldsToUpdate);
    await makeUpdate(fields, this);
  }

  async delete(): Promise<void> {
    if (this.accessesRepository == null) {
      throw new Error('repository not set for Access object.');
    }
    await this.accessesRepository.deleteOne(this.user, this.id);
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

async function makeUpdate(fields?: Array<string>, access: Access): Promise<void> {
  if (access.accessesRepository == null) {
    throw new Error('repository not set for Access object.');
  }
  let update;

  if (fields == null) {
    update = access.forStorage();
  } else {
    update = _.pick(access.forStorage(), fields);
  }
  await access.accessesRepository.updateOne(access.user, update, access.id);
}

function hasReadAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.READ) >= 0;
}
function hasNonReadAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.NONREAD) >= 0;
}
function hasCreateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.CREATE) >= 0;
}
function hasNonCreateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.NONCREATE) >= 0;
}
function hasUpdateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.UPDATE) >= 0;
}
function hasNonUpdateAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.NONUPDATE) >= 0;
}
function hasDeleteAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.DELETE) >= 0;
}
function hasNonDeleteAction(actions?: Array<Action>) {
  return actions != null && actions.indexOf(Actions.NONDELETE) >= 0;
}
