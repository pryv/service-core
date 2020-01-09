

// @flow

const _ = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

import type Repository from './repository';
import type { Logger } from 'components/utils/src/logging';

import type { ActionSet } from './types';

class Stream {
  id: string;
  parentId: ?string;
  name: string;

  children: ?Array<Stream>;

  singleActivity: ?boolean;
  clientData: ?{};
  trashed: ?boolean;

  created: ?number;
  createdBy: ?string;
  modified: ?number;
  modifiedBy: ?string;

  actions: ?ActionSet;

  user: ?{};
  repository: ?Repository;

  logger: Logger;

  constructor(params: {
    id?: string,
    parentId?: string,
    name: string,
    children?: Array<Stream>,
    singleActivity?: boolean,
    clientData?: {},
    created?: number,
    createdBy?: string,
    modified?: number,
    modifiedBy?: string,
    actions?: ActionSet,
    user?: {},
    streamsRepository?: Repository
  }) {
    this.id = params.id || cuid();
    this.parentId = params.parentId || null;
    this.name = params.name;
    this.children = params.children || [];
    this.singleActivity = params.singleActivity || false;
    this.clientData = params.clientData || null;
    this.created = params.created;
    this.createdBy = params.createdBy;
    this.modified = params.modified;
    this.modifiedBy = params.modifiedBy;
    this.actions = params.actions || [];
    this.user = params.user;
    this.repository = params.streamsRepository;
  }

  async save(): Promise<void> {
    if (this.repository == null) {
      throw new Error('Repository not set for Stream object.');
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
      throw new Error('repository not set for Stream object.');
    }
    await this.repository.deleteOne(this.user, this.id);
  }

  forStorage(): {} {
    return _.pick(this, [
      'id',
      'name',
      'parentId',
      'singleActivity',
      'clientData',
      'trashed',
      'created',
      'createdBy',
      'modified',
      'modifiedBy'
    ]);
  }

  forApi(): {} {
    return _.pick(this, [
      'id',
      'name',
      'parentId',
      'singleActivity',
      'clientData',
      'children',
      'trashed',
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
module.exports = Stream;

function log(stream: Stream, msg: string): void {
  if (stream.logger == null) return;
  stream.logger.info(msg);
}

async function makeUpdate(fields?: Array<string>, stream: Stream): Promise<void> {
  if (stream.repository == null) {
    throw new Error('repository not set for Stream object.');
  }
  let update;

  if (fields == null) {
    update = stream.forStorage();
  } else {
    update = _.pick(stream.forStorage(), fields);
  }
  await stream.repository.updateOne(stream.user, update, stream.id);
}