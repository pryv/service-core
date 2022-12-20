/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const lodash = require('lodash');
const Charlatan = require('charlatan');
const generateId = require('cuid');
const logger = require('@pryv/boiler').getLogger('databaseFixture');
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const storage = require('storage');
const Webhook = require('business').webhooks.Webhook;
const { getUsersRepository, User } = require('business/src/users');
const integrityFinalCheck = require('test-helpers/src/integrity-final-check');
const { getMall } = require('mall');
let mall;
/**
 * @returns {Promise<void>}
 */
async function initMall () {
  if (mall == null) {
    mall = await getMall();
  }
}

class Context {
  databaseConn;
  constructor (databaseConn) {
    this.databaseConn = databaseConn;
  }

  /**
   * @param {string} user
   * @returns {UserContext}
   */
  forUser (user) {
    return new UserContext(this, user);
  }

  /**
   * @returns {Promise<unknown>}
   */
  async cleanEverything () {
    const collectionNames = [
      'accesses',
      'sessions',
      'followedSlices',
      'webhooks',
      'versions'
    ];
    collectionNames.forEach((collectionName) => {
      bluebird.fromCallback((cb) => this.databaseConn.deleteMany({ name: collectionName }, {}, cb));
    });
    const usersRepository = await getUsersRepository();
    await usersRepository.deleteAll();
    await initMall();
    // await Promise.all(collections);
    // console.log(await bluebird.fromCallback(cb =>
    //   this.databaseConn.find({ name: 'accesses' }, {},null, cb)));
  }
}

class UserContext {
  userName;

  context;

  user;
  constructor (context, userName) {
    this.context = context;
    this.userName = userName;
    // NOTE For simplicity of debugging, we'll assume that user.id ===
    // user.username.
    this.user = { id: userName };
  }

  /**
   * @returns {{ sessions: Sessions; accesses: any; webhooks: any; }}
   */
  produceDb () {
    const conn = this.context.databaseConn;
    return {
      sessions: new Sessions(conn),
      accesses: new storage.user.Accesses(conn),
      webhooks: new storage.user.Webhooks(conn)
    };
  }
}

class GenericChildHolder {
  childs;

  pending;
  constructor () {
    this.childs = [];
    this.pending = [];
  }

  /**
   * @param {T} child
   * @returns {void}
   */
  push (child) {
    this.childs.push(child);
  }

  /**
   * @returns {boolean}
   */
  hasChilds () {
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
  /**
   * @param {U} resource
   * @param {(a: U) => unknown} cb
   * @returns {Promise<U>}
   */
  create (resource, cb) {
    const createdResource = resource.create();
    this.pending.push(createdResource);
    return createdResource
      .then(() => {
        this.push(resource);
        if (cb) { cb(resource); }
        return bluebird.all(resource.childs.pending);
      })
      .then(() => resource);
  }

  // Calls fun for each child, accumulating the promises returned by fun and
  // then returns a promise that only resolves once all individual promises
  // resolve (aka Promise.all).
  //
  /**
   * @param {(a: T) => Promise<U>} fun
   * @returns {Promise<U[]>}
   */
  all (fun) {
    return bluebird.map(this.childs, fun);
  }
}

class FixtureTreeNode {
  childs;

  context;

  db;

  attrs;
  constructor (context, attrs) {
    this.childs = new GenericChildHolder();
    this.context = context;
    this.db = this.context.produceDb();
    this.attrs = this.attributes(attrs);
  }

  /**
   * @returns {boolean}
   */
  hasChilds () {
    return this.childs.hasChilds();
  }

  /** Merges attributes given with generated attributes and returns the
   * resulting attribute set.
   * @param {{}} attrs
   * @returns {Attributes}
   */
  attributes (attrs) {
    return lodash.merge({
      id: generateId(),
      created: timestamp.now(),
      createdBy: this.context.user.id,
      modified: timestamp.now(),
      modifiedBy: this.context.user.id
    }, this.fakeAttributes(), attrs);
  }

  /** Override this to provide default attributes via Charlatan generation.
   * @returns {{}}
   */
  fakeAttributes () {
    return {};
  }
}

class Fixture {
  childs;

  context;
  constructor (context) {
    this.context = context;
    this.childs = new GenericChildHolder();
  }

  // ----------------------------------------------------------------------- dsl
  // Creates a Pryv user. If a block is given (`cb`), it is called after
  // the user is really created.
  //
  /**
   * @param {string} name
   * @param {{}} attrs
   * @param {(a: FixtureUser) => unknown} cb
   * @returns {Promise<FixtureUser>}
   */
  async user (name, attrs = {}, cb) {
    await initMall();
    return bluebird.try(() => {
      const u = new FixtureUser(this.context.forUser(name), name, attrs);
      return u.remove().then(() => this.childs.create(u, cb));
    });
  }

  // Cleans all created structures from the database. Usually, you would call
  // this in an afterEach function to ensure that the database is clean after
  // running tests.
  //
  /**
   * @returns {Promise<unknown>}
   */
  async clean () {
    let errorIntegrity;
    try {
      // check integrity before reset--- This could trigger error related to previous test
      await integrityFinalCheck.all();
    } catch (e) {
      errorIntegrity = e; // keep it for later
    }
    // clean data anyway
    const done = await this.childs.all((child) => {
      return child.remove();
    });
    if (errorIntegrity) {
      console.log(errorIntegrity);
      // throw(errorIntegrity);
    }
    return done;
  }
}
/** @extends FixtureTreeNode */
class FixtureUser extends FixtureTreeNode {
  /** Internal constructor for a user fixture. */
  constructor (context, name, attrs) {
    super(context, lodash.merge({
      id: name,
      username: name,
      storageUsed: 0,
      insurancenumber: Charlatan.Number.number(5),
      phoneNumber: Charlatan.Number.number(5)
    }, attrs));
  }

  /**
   * @param {{}} attrs
   * @param {(a: FixtureStream) => void} cb
   * @returns {Promise<unknown>}
   */
  stream (attrs = {}, cb) {
    const s = new FixtureStream(this.context, attrs);
    return this.childs.create(s, cb);
  }

  /**
   * @param {{}} attrs
   * @returns {Promise<FixtureEvent>}
   */
  event (attrs) {
    logger.debug('event', attrs);
    const e = new FixtureEvent(this.context, attrs);
    return this.childs.create(e);
  }

  /**
   * @param {{}} attrs
   * @returns {Promise<unknown>}
   */
  access (attrs = {}) {
    const a = new FixtureAccess(this.context, attrs);
    return this.childs.create(a);
  }

  /**
   * @param {string} token
   * @returns {Promise<unknown>}
   */
  session (token) {
    const s = new FixtureSession(this.context, token);
    return this.childs.create(s);
  }

  /**
   * @param {{}} attrs
   * @param {string} accessId
   * @returns {Promise<unknown>}
   */
  webhook (attrs = {}, accessId) {
    const w = new FixtureWebhook(this.context, attrs, accessId);
    return this.childs.create(w);
  }

  /** Removes all resources belonging to the user, then creates them again,
   * according to the spec stored here.
   * @returns {Promise<unknown>}
   */
  create () {
    return this.createUser();
  }

  /**
   * @returns {any}
   */
  async createUser () {
    const attributes = this.attrs;
    const usersRepository = await getUsersRepository();
    const userObj = new User(attributes);
    await usersRepository.insertOne(userObj, false, true);
    return this.attrs;
  }

  /**
   * @returns {Promise<unknown>}
   */
  async remove () {
    const db = this.db;
    const username = this.context.userName;
    const collections = [db.accesses, db.webhooks];
    // NOTE username in context will be the same as the one stored in
    // this.attrs.
    // const removeUser = bluebird.fromCallback((cb) =>
    //  db.users.removeOne(user, {username: username}, cb));
    // get streams ids from the config that should be deleted
    // const accountStreams = SystemStreamsSerializer.getAccountMap();
    const usersRepository = await getUsersRepository();
    await usersRepository.deleteOne(this.context.user.id, username, true);
    const removeSessions = bluebird.fromCallback((cb) => db.sessions.removeForUser(username, cb));
    return bluebird
      .all([removeSessions])
      .then(() => bluebird.map(collections, (coll) => this.safeRemoveColl(coll)));
  }

  /**
   * @returns {Promise<any>}
   */
  safeRemoveColl (col) {
    const user = this.context.user;
    // const colName = col.getCollectionInfo(user).name;
    return (bluebird
      .fromCallback((cb) => col.dropCollection(user, cb))
    // .then(() => console.log('dropped', colName))
      .catch((err) => {
        if (!/ns not found/.test(err.message)) { throw err; }
      }));
  }

  /**
   * @returns {{ email: any; password: any; language: string; }}
   */
  fakeAttributes () {
    return {
      email: Charlatan.Internet.email(),
      password: Charlatan.Lorem.characters(10),
      language: 'fr'
    };
  }
}
/** @extends FixtureTreeNode */
class FixtureStream extends FixtureTreeNode {
  parentId;
  constructor (context, attrs, parentId) {
    if (parentId) {
      attrs.parentId = parentId;
    }
    super(context, attrs);
    this.parentId = attrs.parentId;
  }

  /**
   * @param {{}} attrs
   * @param {(a: FixtureStream) => void} cb
   * @returns {Promise<FixtureStream>}
   */
  stream (attrs = {}, cb) {
    const s = new FixtureStream(this.context, attrs, this.attrs.id);
    return this.childs.create(s, cb);
  }

  /**
   * @param {{}} attrs
   * @returns {Promise<FixtureEvent>}
   */
  event (attrs) {
    logger.debug('event', attrs);
    const e = new FixtureEvent(this.context, attrs, this.attrs.id);
    return this.childs.create(e);
  }

  /**
   * @returns {any}
   */
  create () {
    const user = this.context.user;
    const attributes = this.attrs;
    return mall.streams.create(user.id, attributes);
  }

  /**
   * @returns {{ id: string; name: any; parentId: string; }}
   */
  fakeAttributes () {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      name: Charlatan.Lorem.characters(10),
      parentId: this.parentId
    };
  }
}
/** @extends FixtureTreeNode */
class FixtureEvent extends FixtureTreeNode {
  constructor (context, attrs, streamId) {
    if (streamId) {
      // used by stream.event()
      super(context, { ...attrs, streamIds: [streamId] });
    } else {
      // streamIds must be provided by user.event()
      super(context, attrs);
    }
  }

  /**
   * @returns {any}
   */
  create () {
    return bluebird.try(async () => await this.createEvent());
  }

  /**
   * @returns {Promise<any>}
   */
  async createEvent () {
    const user = this.context.user;
    const attributes = this.attrs;
    if (mall == null) { mall = await getMall(); }
    return await mall.events.create(user.id, attributes);
  }

  /**
   * @returns {{ id: string; time: number; duration: number; type: any; tags: any[]; content: number; }}
   */
  fakeAttributes () {
    // NOTE no need to worry about streamId, this is enforced by the
    // constructor.
    return {
      id: `c${Charlatan.Number.number(15)}`,
      time: Charlatan.Date.backward().getTime() / 1000,
      duration: 0,
      type: Charlatan.Helpers.sample(['mass/kg']),
      tags: [],
      content: 90
    };
  }
}
/** @extends FixtureTreeNode */
class FixtureAccess extends FixtureTreeNode {
  /**
   * @returns {any}
   */
  create () {
    const db = this.db;
    const user = this.context.user;
    const attributes = _.merge(this.fakeAttributes(), this.attrs);
    return bluebird.fromCallback((cb) => db.accesses.insertOne(user, attributes, cb));
  }

  /**
   * @returns {{ id: string; token: any; name: any; type: any; }}
   */
  fakeAttributes () {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      token: Charlatan.Internet.deviceToken(),
      name: Charlatan.Internet.userName(),
      type: Charlatan.Helpers.sample(['personal', 'shared'])
    };
  }
}
/** @extends FixtureTreeNode */
class FixtureWebhook extends FixtureTreeNode {
  constructor (context, attrs, accessId) {
    super(context, { ...attrs, accessId });
  }

  /**
   * @returns {any}
   */
  create () {
    const db = this.db;
    const user = this.context.user;
    const attributes = this.attrs;
    const webhook = new Webhook(attributes).forStorage();
    return bluebird.fromCallback((cb) => db.webhooks.insertOne(user, webhook, cb));
  }

  /**
   * @returns {{ id: any; url: string; }}
   */
  fakeAttributes () {
    return {
      id: generateId(),
      url: `https://${Charlatan.Internet.domainName()}/notifications`
    };
  }
}
/** A hack that allows session creation. The storage.Sessions interface
 * will not really allow fixture creation, so we're cloning some of the code
 * here.
 * @extends FixtureTreeNode
 */
class FixtureSession extends FixtureTreeNode {
  session;
  constructor (context, token) {
    const attrs = {};
    if (token != null) { attrs.id = token; }
    super(context, attrs);
  }

  /**
   * @returns {any}
   */
  create () {
    return bluebird.try(() => this.createSession());
  }

  /**
   * @returns {any}
   */
  createSession () {
    const db = this.db;
    const user = this.context.user;
    const attributes = this.attrs;
    return bluebird.fromCallback((cb) => db.sessions.insertOne(user, attributes, cb));
  }

  /**
   * @returns {{ _id: any; expires: any; data: { username: any; appId: any; }; }}
   */
  fakeAttributes () {
    const getNewExpirationDate = storage.Sessions.prototype.getNewExpirationDate.bind({
      options: {
        maxAge: 1000 * 60 * 60 * 24 * 14 // two weeks
      }
    });
    return {
      _id: generateId(),
      expires: getNewExpirationDate(),
      data: {
        username: this.context.user.username,
        appId: Charlatan.App.name()
      }
    };
  }
}

class Sessions {
  collectionInfo;

  databaseConn;
  constructor (databaseConn) {
    this.databaseConn = databaseConn;
    this.collectionInfo = {
      name: 'sessions',
      indexes: [
        // set TTL index for auto cleanup of expired sessions
        {
          index: { expires: 1 },
          options: { expireAfterSeconds: 0 }
        }
      ]
    };
  }

  /**
   * @param {{
   *       id: string;
   *     }} user
   * @param {Attributes} attributes
   * @param {() => void} cb
   * @returns {void}
   */
  insertOne (user, attributes, cb) {
    const id = attributes.id;
    delete attributes.id;
    attributes._id = id;
    this.databaseConn.insertOne(this.collectionInfo, attributes, cb);
  }

  /**
   * @param {string} userName
   * @param {() => void} cb
   * @returns {void}
   */
  removeForUser (userName, cb) {
    this.databaseConn.deleteMany(this.collectionInfo, { 'data.username': userName }, cb);
  }
}
/**
 * @param {storage.Database} database
 * @returns {Fixture}
 */
function databaseFixture (database) {
  const context = new Context(database);
  return new Fixture(context);
}
module.exports = databaseFixture;

/**
 * @typedef {{
 *   sessions: Sessions;
 *   streams: storage.user.Streams;
 *   accesses: storage.user.Accesses;
 *   webhooks: storage.user.Webhooks;
 * }} DatabaseShortcuts
 */

/** @typedef {GenericChildHolder<ChildResource>} ChildHolder */

/**
 * @typedef {{
 *   id: string;
 *   _id: string;
 * }} Attributes
 */

/** @typedef {Object} ChildResource
 * @property {ChildHolder} childs
 * @property {Attributes} attrs
 */
