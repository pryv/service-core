/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const R = require('ramda');
const lodash = require('lodash');
const Charlatan = require('charlatan');
const generateId = require('cuid');
const logger = require('boiler').getLogger('databaseFixture');
const timestamp = require('unix-timestamp');
const _ = require('lodash');

const storage = require('components/storage');

const Webhook = require("components/business").webhooks.Webhook;
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const UsersRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

class Context {
  databaseConn: storage.Database; 
  
  constructor(databaseConn) {
    this.databaseConn = databaseConn; 
  }
  
  forUser(user: string) {
    return new UserContext(this, user);
  }

  async cleanEverything (): Promise<mixed> {
    const collectionNames = ['events', 'accesses', 'sessions', 'streams', 'followedSlices', 'webhooks', 'versions']
    const collections = collectionNames.map(collectionName => {
      return bluebird.fromCallback(cb => this.databaseConn.deleteMany({ name: collectionName }, {}, cb))
    });
    // await Promise.all(collections);
    // console.log(await bluebird.fromCallback(cb =>
    //   this.databaseConn.find({ name: 'accesses' }, {},null, cb)));
  }
}

type DatabaseShortcuts = {
  sessions: Sessions, 
  
  streams: storage.user.Streams, 
  events: storage.user.Events, 
  accesses: storage.user.Accesses, 
  webhooks: storage.user.Webhooks,
}
class UserContext {
  userName: string; 
  context: Context;
  user: {
    id: string,
  };
  
  constructor(context, userName: string) {
    this.context = context; 
    this.userName = userName;
    
    // NOTE For simplicity of debugging, we'll assume that user.id ===
    // user.username. 
    this.user = { id: userName };
  }
  
  produceDb() {
    const conn = this.context.databaseConn;
    return {
      sessions: new Sessions(conn),
      
      streams: new storage.user.Streams(conn),
      events: new storage.user.Events(conn),
      accesses: new storage.user.Accesses(conn),
      webhooks: new storage.user.Webhooks(conn),
    };
  }
}

interface ChildResource {
  create(): Promise<mixed>;
  childs: ChildHolder;
  attrs: Attributes;
}
class GenericChildHolder<T: ChildResource> {
  childs: Array<T>; 
  pending: Array<Promise<*>>;
  
  constructor() {
    this.childs = []; 
    this.pending = [];
  }
  
  push(child: T) {
    this.childs.push(child);
  }
  
  hasChilds(): boolean {
    return this.childs.length > 0;
  }
  
  // Adds a child to the child holder. This will a) create the child using the
  // #create method, b) add the child to be tracked using this holder and 
  // c) call the callback (`cb`).
  // 
  // The signature might be a little bit confusing, let's try and clear this up:
  // Child needs to be any subclass of T. The first parameter of the callback 
  // (if given) needs to be of the same type, subclass of T. 
  // 
  create<U: T>(resource: U, cb?: (U) => mixed): Promise<U> {
    const name = resource.constructor.name;
    logger.debug('create', name, resource.attrs);
    
    const createdResource = resource.create();
    this.pending.push(createdResource);
    
    return createdResource
      .then(() => {
        this.push(resource);
        logger.debug(name, 'entering cb');
        if (cb) cb(resource);
        logger.debug(name, 'leaving cb, has ', this.pending.length, 'pending.');
          
        return bluebird.all(resource.childs.pending); 
      })
      .then(() => resource);
  }

  // Calls fun for each child, accumulating the promises returned by fun and 
  // then returns a promise that only resolves once all individual promises 
  // resolve (aka Promise.all).
  // 
  all<U>(fun: (T) => Promise<U>): Promise<Array<U>> {
    return bluebird.map(this.childs, fun);
  }
}
type ChildHolder = GenericChildHolder<ChildResource>;
type Attributes = {
  id: string, 
  _id: string, 
}
class FixtureTreeNode {
  childs: ChildHolder;
  context: UserContext; 
  db: DatabaseShortcuts; 
  attrs: Attributes; 
    
  constructor(context: UserContext, attrs: {}) {
    this.childs = new GenericChildHolder(); 
    this.context = context; 
    
    this.db = this.context.produceDb(); 
    
    this.attrs = this.attributes(attrs);
  }
  
  hasChilds(): boolean {
    return this.childs.hasChilds();
  }
  
  /** Merges attributes given with generated attributes and returns the
   * resulting attribute set. 
   */
  attributes(attrs: {}): Attributes {
    return lodash.merge(
      { 
        id: generateId(),
        created: timestamp.now(),
        createdBy: this.context.user.id,
        modified: timestamp.now(),
        modifiedBy: this.context.user.id,
      },
      this.fakeAttributes(),
      attrs,
    );
  }

  /** Override this to provide default attributes via Charlatan generation. 
   */
  fakeAttributes() {
    return {}; 
  }
}

class Fixture {
  childs: GenericChildHolder<FixtureUser>; 
  context: Context; 
  
  constructor(context: Context) {
    this.context = context; 
    
    this.childs = new GenericChildHolder(); 
  }
  
  // ----------------------------------------------------------------------- dsl

  // Creates a Pryv user. If a block is given (`cb`), it is called after
  // the user is really created. 
  // 
  user(name: string, attrs: {}={}, cb?: (FixtureUser) => mixed): Promise<FixtureUser> {
    return bluebird.try(() => {
      const u = new FixtureUser(
        this.context.forUser(name),
        name, attrs);

      return u.remove()
        .then(() => this.childs.create(u, cb));
    });
  }
  
  // Cleans all created structures from the database. Usually, you would call 
  // this in an afterEach function to ensure that the database is clean after
  // running tests. 
  //
  clean(): Promise<mixed> {
    return this.childs.all(
      (child) => {
        return child.remove();
      });
  }
}

class FixtureUser extends FixtureTreeNode implements ChildResource {  
  /** Internal constructor for a user fixture. */
  constructor (context: UserContext, name: string, attrs: {}) {
    super(
      context, 
      lodash.merge({
        id: name,
        username: name,
        storageUsed: 0,
        insurancenumber: Charlatan.Number.number(5),
        phoneNumber: Charlatan.Number.number(5)
      }, attrs));
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void): Promise<mixed> {
    const s = new FixtureStream(this.context, attrs);

    return this.childs.create(s, cb);
  }

  event(attrs: {}): Promise<FixtureEvent> {
    logger.debug('event', attrs);
    const e = new FixtureEvent(this.context, attrs);

    return this.childs.create(e);
  }

  access(attrs: {}={}): Promise<mixed> {
    const a = new FixtureAccess(this.context, attrs); 
  
    return this.childs.create(a);
  }
  session(token?: string): Promise<mixed> {
    const s = new FixtureSession(this.context, token); 
    
    return this.childs.create(s);
  }
  webhook(attrs: {}={}, accessId: string): Promise<mixed> {
    const w = new FixtureWebhook(this.context, attrs, accessId);
    return this.childs.create(w);
  }
  
  /** Removes all resources belonging to the user, then creates them again, 
   * according to the spec stored here. 
   */
  create (): Promise<mixed> {
    return this.createUser();
  }

  async createUser (): Object<mixed> {
    const db = this.db;
    const attributes = this.attrs;
    const usersRepository = new UsersRepository(db.events);
    let userObj: User = new User(attributes);
    await usersRepository.insertOne(userObj);
    return this.attrs;
  }

  async remove(): Promise<mixed> {
    const db = this.db; 
    const user = null; // NOTE not needed for access to users collection.
    const username = this.context.userName; 
    const collections = [
      db.streams, 
      db.events,
      db.accesses, 
      db.webhooks,
    ];
        
    // NOTE username in context will be the same as the one stored in
    // this.attrs.
    //const removeUser = bluebird.fromCallback((cb) => 
    //  db.users.removeOne(user, {username: username}, cb));
    // get streams ids from the config that should be deleted
    const accountStreams = SystemStreamsSerializer.getAllAccountStreams();
    const removeUser = bluebird.fromCallback((cb) => {
      db.events.removeMany(this.context.user, {
        $and:[
          { streamIds: { $in: Object.keys(accountStreams) } }]
      }, cb)
    });
    
    const removeSessions = bluebird.fromCallback((cb) => 
      db.sessions.removeForUser(username, cb));

    return bluebird
      .all([removeUser, removeSessions])
      .then(() => 
        bluebird.map(collections, (coll) => this.safeRemoveColl(coll)) );
  }
  safeRemoveColl(col): Promise<*> {
    const user = this.context.user;
    // const colName = col.getCollectionInfo(user).name;

    return bluebird
      .fromCallback((cb) => col.dropCollection(user, cb))
      // .then(() => console.log('dropped', colName))
      .catch((err) => {
        if (! /ns not found/.test(err.message)) throw err; 
      });
  }
    
  fakeAttributes() {
    return {
      email: Charlatan.Internet.email(), 
      password: Charlatan.Lorem.characters(10), 
      language: 'fr',
    };
  }
}
class FixtureStream extends FixtureTreeNode implements ChildResource {
  parentId: ?string; 
  
  constructor(context: UserContext, attrs: {}, parentId: ?string) {
    if (parentId) {
      attrs.parentId = parentId;
    }
    super(context, attrs);
    this.parentId = attrs.parentId; 
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void) {
    const s = new FixtureStream(this.context, attrs, this.attrs.id); 

    return this.childs.create(s, cb);
  }
  event(attrs: {}): Promise<FixtureEvent> {
    logger.debug('event', attrs);
    const e = new FixtureEvent(this.context, attrs, this.attrs.id); 
    
    return this.childs.create(e);
  }
  
  create() {
    const db = this.db; 
    const user = this.context.user; 
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      db.streams.insertOne(user, attributes, cb)); 
  }

  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      name: Charlatan.Lorem.characters(10), 
      parentId: this.parentId, 
    };
  }
}
class FixtureEvent extends FixtureTreeNode implements ChildResource {
  constructor(context: UserContext, attrs: {}, streamId: string) {
    if (streamId) {
      // used by stream.event()
      super(context, R.merge(attrs, {streamIds: [streamId]}));
    } else { 
      // streamIds must be provided by user.event()
      super(context, attrs);
    }
  }
  
  create() {
    return bluebird
      .try(() => this.createEvent());
  }
  createEvent() {
    const db = this.db; 
    const user = this.context.user; 
    const attributes = this.attrs; 

    return bluebird.fromCallback((cb) => 
      db.events.insertOne(user, attributes, cb)); 
  }

  fakeAttributes() {
    // NOTE no need to worry about streamId, this is enforced by the
    // constructor. 
    return {
      id: `c${Charlatan.Number.number(15)}`,
      time: Charlatan.Date.backward().getTime() / 1000, 
      duration: 0, 
      type: Charlatan.Helpers.sample(['mass/kg']), 
      tags: [], 
      content: 90, 
    };
  }
}
class FixtureAccess extends FixtureTreeNode implements ChildResource {
  constructor(context: UserContext, attrs: {}) {
    super(context, attrs);
  }
  
  create() {
    const db = this.db; 
    const user = this.context.user; 
    const attributes = _.merge(this.fakeAttributes(), this.attrs); 
    return bluebird.fromCallback((cb) => 
      db.accesses.insertOne(user, attributes, cb)); 
  }

  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      token: Charlatan.Internet.deviceToken(), 
      name: Charlatan.Internet.userName(),
      type: Charlatan.Helpers.sample(['personal', 'shared']), 
    };
  }
}

class FixtureWebhook extends FixtureTreeNode implements ChildResource {
  constructor(context: UserContext, attrs: {}, accessId: string) {
    super(context, R.merge(attrs, {accessId: accessId}));
  }

  create() {
    const db = this.db;
    const user = this.context.user;
    const attributes = this.attrs;
    const webhook = new Webhook(attributes).forStorage();
    return bluebird.fromCallback(
      (cb) => db.webhooks.insertOne(user, webhook, cb)
    );
  }

  fakeAttributes() {
    return {
      id: generateId(),
      url: `https://${Charlatan.Internet.domainName()}/notifications`,
    };
  }
}

/** A hack that allows session creation. The storage.Sessions interface 
 * will not really allow fixture creation, so we're cloning some of the code 
 * here. 
 */
class FixtureSession extends FixtureTreeNode implements ChildResource {
  session: storage.Sessions; 
  
  constructor(context: UserContext, token?: string) {
    const attrs = {}; 
    if (token != null) attrs.id = token; 
    
    super(context, attrs);
  }
  
  create() {
    return bluebird
      .try(() => this.createSession());
  }
  createSession() {
    const db = this.db; 
    const user = this.context.user; 
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      db.sessions.insertOne(user, attributes, cb));
  }

  fakeAttributes() {
    const getNewExpirationDate = storage.Sessions.prototype.getNewExpirationDate
      .bind({
        options: {
          maxAge: 1000 * 60 * 60 * 24 * 14, // two weeks
        },
      });
    
    return {
      _id: generateId(), 
      expires: getNewExpirationDate(), 
      data: {
        username: this.context.userName, 
        appId: Charlatan.App.name(), 
      },
    };
  }
}

import type { IndexDefinition } from 'components/storage';

class Sessions {
  collectionInfo: {
    name: string, 
    indexes: Array<IndexDefinition>, 
  }
  databaseConn: storage.Database; 
  
  constructor(databaseConn: storage.Database) {
    this.databaseConn = databaseConn;
    
    this.collectionInfo = {
      name: 'sessions',
      indexes: [
        // set TTL index for auto cleanup of expired sessions
        {
          index: {expires: 1},
          options: {expireAfterSeconds: 0}
        }
      ]
    };
  }
  
  insertOne(user: {id: string}, attributes: Attributes, cb: () => void) {
    const id = attributes.id; 
    delete attributes.id; 
    attributes['_id'] = id; 
    
    this.databaseConn.insertOne(
      this.collectionInfo, 
      attributes, 
      cb);
  }
  
  removeForUser (userName: string, cb: () => void) {
    this.databaseConn.deleteMany(
      this.collectionInfo, 
      {'data.username': userName}, 
      cb);
  }
}

function databaseFixture (database: storage.Database) {
  const context = new Context(database);

  return new Fixture(context);
}

module.exports = databaseFixture;
