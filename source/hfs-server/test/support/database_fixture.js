// @flow

import type {Suite} from 'mocha';

const bluebird = require('bluebird');
const R = require('ramda');
const Charlatan = require('charlatan');
const generateId = require('cuid');

const storage = require('components/storage');

class Context {
  databaseConn: storage.Database; 
  
  constructor(databaseConn) {
    this.databaseConn = databaseConn; 
  }
  
  forUser(user: string) {
    return new UserContext(this, user);
  }
}

type DatabaseShortcuts = {
  users: storage.Users, 
  sessions: Sessions, 
  
  streams: storage.Streams, 
  events: storage.Events, 
  accesses: storage.user.Accesses, 
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
      users: new storage.Users(conn),
      sessions: new Sessions(conn),
      
      streams: new storage.user.Streams(conn),
      events: new storage.user.Events(conn),
      accesses: new storage.user.Accesses(conn),
    };
  }
}

interface ChildResource {
  create(): Promise<mixed>;
}
class GenericChildHolder<T: ChildResource> {
  childs: Array<T>; 
  
  constructor() {
    this.childs = []; 
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
    return resource.create()
      .then(() => {
        this.push(resource);
        if (cb) cb(resource);
                
        return resource; 
      });
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
    return R.mergeAll([
      { id: `c${Charlatan.Number.number(15)}` },
      this.fakeAttributes(),
      attrs,
    ]);
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
      (child) => child.remove());
  }
}

class FixtureUser extends FixtureTreeNode implements ChildResource {
  attrs: Attributes; 
  
  /** Internal constructor for a user fixture. */
  constructor(context: UserContext, name: string, attrs: {}) {
    super(context, R.mergeAll([attrs, {id: name, username: name}]));
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void) {
    const s = new FixtureStream(this.context, attrs);

    return this.childs.create(s, cb);
  }
  access(attrs: {}={}) {
    const a = new FixtureAccess(this.context, attrs); 
  
    return this.childs.create(a);
  }
  session(token?: string) {
    const s = new FixtureSession(this.context, token); 
    
    return this.childs.create(s);
  }
  
  /** Removes all resources belonging to the user, then creates them again, 
   * according to the spec stored here. 
   */
  create(): Promise<mixed> {
    const db = this.db; 
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      db.users.insertOne(attributes, cb)); 
  }
  
  remove(): Promise<mixed> {
    const db = this.db; 
    const user = null; // NOTE not needed for access to users collection.
    const username = this.context.userName; 
    const collections = [
      db.streams, 
      db.events,
      db.accesses, 
    ];
        
    // NOTE username in context will be the same as the one stored in
    // this.attrs.
    const removeUser = bluebird.fromCallback((cb) => 
      db.users.removeOne(user, {username: username}, cb));
      
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
      password: Charlatan.Internet.password(), 
      language: 'fr',
    };
  }
}
class FixtureStream extends FixtureTreeNode implements ChildResource {
  attrs: Attributes; 
  parentId: ?string; 
  
  constructor(context: UserContext, attrs: {}, parentId: ?string) {
    super(context, R.merge(attrs, {parentId: parentId}));
    
    this.parentId = parentId; 
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void) {
    const s = new FixtureStream(this.context, attrs, this.attrs.id); 

    return this.childs.create(s, cb);
  }
  event(attrs: {}) {
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
      name: Charlatan.Internet.domainName(), 
      parentId: this.parentId, 
    };
  }
}
class FixtureEvent extends FixtureTreeNode implements ChildResource {
  constructor(context: UserContext, attrs: {}, streamId: string) {
    super(context, 
      R.merge(attrs, {streamId: streamId}));
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
      time: Charlatan.Date.backward(), 
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
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      db.accesses.insertOne(user, attributes, cb)); 
  }

  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      token: Charlatan.Internet.deviceToken(), 
      name: Charlatan.Commerce.productName(), 
      type: Charlatan.Helpers.sample(['personal', 'shared']), 
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
class Sessions {
  collectionInfo: {
    name: string, 
    indexes: Array<{}>, 
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
  
  removeForUser(userName: string, cb: () => void) {
    this.databaseConn.deleteMany(
      this.collectionInfo, 
      {'data.username': userName}, 
      cb);
  }
}

function databaseFixture(database: storage.Database) {
  const context = new Context(database);
  
  return new Fixture(context);
}

module.exports = databaseFixture;
