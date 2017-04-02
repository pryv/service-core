// @flow

import type {Suite} from 'mocha';

const bluebird = require('bluebird');
const R = require('ramda');
const Charlatan = require('charlatan');

const storage = require('components/storage');

class Context {
  databaseConn: storage.Database; 
  mochaContext: Suite; 
  
  constructor(databaseConn, mochaContext) {
    this.databaseConn = databaseConn; 
    this.mochaContext = mochaContext; 
  }
  
  registerBeforeEach(fun: (done: () => void) => void) {
    this.mochaContext.beforeEach(fun);
  }
  
  forUser(user: string) {
    return new UserContext(this, user);
  }
}

type DatabaseShortcuts = {
  users: storage.Users, 
  streams: storage.Streams, 
  events: storage.Events, 
  accesses: storage.Accesses, 
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
      streams: new storage.user.Streams(conn),
      events: new storage.user.Events(conn),
      accesses: new storage.user.Accesses(conn),
    };
  }
}

interface ChildResource {
  create(): Promise<*>;
}
class ChildHolder {
  childs: Array<ChildResource>; 
  
  constructor() {
    this.childs = []; 
  }
  
  push(child: ChildResource) {
    this.childs.push(child);
  }
  
  hasChilds(): boolean {
    return this.childs.length > 0;
  }
  
  createAll(...rest) {
    return bluebird.map(this.childs, 
      (child) => child.create(...rest));
  }
}
type Attributes = {
  id: string, 
}
class FixtureTreeNode {
  childs: ChildHolder;
  context: UserContext; 
  db: DatabaseShortcuts; 
  attrs: Attributes; 
    
  constructor(context: UserContext, attrs: {}) {
    this.childs = new ChildHolder(); 
    this.context = context; 
    
    this.db = this.context.produceDb(); 
    
    this.attrs = this.attributes(attrs);
  }
  
  addChild(child: ChildResource) {
    this.childs.push(child);
  }
  hasChilds(): boolean {
    return this.childs.hasChilds();
  }
  
  createChildResources(): Promise<*> {
    return this.childs.createAll();
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
  hookRegistered: boolean;
  childs: ChildHolder; 
  context: Context; 
  
  constructor(context: Context) {
    this.context = context; 
    
    this.childs = new ChildHolder(); 
    this.hookRegistered = false; 
  }
  
  user(name: string, attrs: {}={}, cb?: (FixtureUser) => void): FixtureUser {
    const u = new FixtureUser(
      this.context.forUser(name), 
      name, attrs);
    
    this.addChild(u);
    
    if (cb) cb(u);
    return u;
  }
  
  // Overrides parent implementation
  addChild(u: ChildResource) {
    this.childs.push(u);
    
    // Make sure that we hook into mocha, but only once. 
    if (!this.hookRegistered) {
      this.hookRegistered = true; 
      
      this.context.registerBeforeEach((done) => 
        this.beforeEachHook(done));
    }
  }
  
  /** Gets called in beforeEach. */
  beforeEachHook(done: () => void) {
    if (! this.childs.hasChilds()) return done(); 

    this.childs.createAll().asCallback(done);
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

    this.addChild(s);
    if (cb) cb(s);

    return s; 
  }
  access(attrs: {}={}) {
    const a = new FixtureAccess(this.context, attrs); 
    
    this.addChild(a);

    return a; 
  }
  
  /** Removes all resources belonging to the user, then creates them again, 
   * according to the spec stored here. 
   */
  create(): Promise<*> {
    return bluebird
      .try(() => this.remove()) // Remove user if it exists, including all associated data
      .then(() => this.createUser()) // Create user
      .then(() => this.createChildResources()); // Create child resources
  }
  
  remove() {
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

    return removeUser
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
  
  createUser() {
    const db = this.db; 
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      db.users.insertOne(attributes, cb)); 
  }
  
  fakeAttributes() {
    return {
      username: Charlatan.Internet.userName(),
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
    
    this.addChild(s);
    if (cb) cb(s);

    return s; 
  }
  event(attrs: {}) {
    const e = new FixtureEvent(this.context, attrs, this.attrs.id); 
    
    this.addChild(e);
    
    return e; 
  }
  
  create() {
    return bluebird
      .try(() => this.createStream())
      .then(() => this.createChildResources()); 
  }
  createStream() {
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
    return bluebird
      .try(() => this.createAccess());
  }
  createAccess() {
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

function databaseFixture(database: storage.Database, mochaContext: Suite) {
  const context = new Context(database, mochaContext);
  
  return new Fixture(context);
}

module.exports = databaseFixture;
