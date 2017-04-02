// @flow

import type {Suite} from 'mocha';

const bluebird = require('bluebird');
const R = require('ramda');
const Charlatan = require('charlatan');

const storage = require('components/storage');

class Fixture {
  mocha: *;
  
  users: Array<FixtureUser>;
  hookRegistered: boolean;
  
  constructor(mochaContext: Suite) {
    this.mocha = mochaContext;
    this.users = []; 
    this.hookRegistered = false; 
  }
  
  user(name: string, attrs: UserAttributes={}, cb: (FixtureUser) => void) {
    const u = new FixtureUser(name, attrs);
    
    this.registerUser(u);
    
    if (cb) cb(u);
    return u;
  }
  
  registerUser(user: FixtureUser) {
    this.users.push(user);
    
    if (!this.hook$hookRegistered) {
      this.mocha.beforeEach((done) => {
        this.beforeEachHook(done); 
      });
    }
  }
  
  /** Gets called in beforeEach. */
  beforeEachHook(done: () => void) {
    if (this.users.length <= 0) return done(); 
    
    const userOps = []; 
    for (let user of this.users) {
      userOps.push(
        this.createUserFixture(user));
    }

    bluebird.all(userOps).asCallback(done);
  }

  createUserFixture(user: FixtureUser): Promise<void> {
    return user.recreate();
  }
}

type Attributes = {
  id: string, 
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
  
  createAll(...rest) {
    return bluebird.map(this.childs, 
      (child) => child.create(...rest));
  }
}

class FixtureUser {
  childs: ChildHolder; 
  
  attrs: Attributes; 
  name: string; 
  
  /** Internal constructor for a user fixture. */
  constructor(name: string, attrs: UserAttributes) {
    this.name = name; 
    this.attrs = this.attributes(attrs); 
    this.childs = new ChildHolder(); 
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void) {
    const s = new FixtureStream(this.name, null, attrs); 
    this.childs.push(s);
    
    if (cb) cb(s);

    return s; 
  }
  access(attrs: {}={}) {
    const a = new FixtureAccess(this.name, attrs); 
    this.childs.push(a);

    return a; 
  }
  
  /** Removes all resources belonging to the user, then creates them again, 
   * according to the spec stored here. */
  recreate(): Promise<*> {
    return bluebird
      .try(() => this.remove()) // Remove user if it exists, including all associated data
      .then(() => this.create()) // Create user
      .then(() => this.createChildResources); // Create child resources
  }
  
  remove() {
    const user = null; // NOTE not needed for access to users collection.
    return bluebird.fromCallback((cb) => 
      storage.users.removeOne(user, {username: this.name}, cb));
  }
  create() {
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      storage.users.insertOne(attributes, cb)); 
  }
  createChildResources() {
    return this.childs.createAll(); 
  }
  
  attributes(attrs: {}): Attributes {
    return R.mergeAll(
      this.fakeAttributes(),
      attrs || {}, 
      {username: this.name},
    );
  }
  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      username: Charlatan.Internet.userName(),
      email: Charlatan.Internet.email(), 
      password: Charlatan.Internet.password(), 
    };
  }
}
class FixtureStream implements ChildResource {
  childs: ChildHolder; 
  
  attrs: Attributes; 
  
  parentId: ?string; 
  user: string; 
  
  // TODO worry about a streams parent
  
  constructor(user: string, parentId: ?string, attrs: {}) {
    this.attrs = this.attributes(attrs); 
    this.user = user; 
    this.parentId = parentId; 
    this.childs = new ChildHolder(); 
  }
  
  stream(attrs: {}={}, cb: (FixtureStream) => void) {
    const s = new FixtureStream(this.user, this.attrs.id, attrs); 
    this.childs.push(s);
    
    if (cb) cb(s);

    return s; 
  }
  event(attrs: {}) {
    const e = new FixtureEvent(this.user, this.attrs.id, attrs); 
    this.childs.push(e);
    
    return e; 
  }
  
  create() {
    return bluebird
      .try(() => this.createStream())
      .then(() => this.createChildResources()); 
  }
  createStream() {
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      storage.streams.insertOne(this.user, attributes, cb)); 
  }
  createChildResources() {
    return this.childs.createAll();
  }

  attributes(attrs: {}): Attributes {
    return R.mergeAll(
      this.fakeAttributes(),
      attrs || {}, 
    );
  }
  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      name: Charlatan.Internet.domainName(), 
      parentId: this.parentId, 
    };
  }
}
class FixtureEvent implements ChildResource {
  attrs: {}; 
  user: string; 
  streamId: string; 
  
  constructor(user: string, streamId: string, attrs: {}) {
    this.attrs = this.attributes(attrs); 
    this.user = user; 
    this.streamId = streamId;
  }
  
  create() {
    return bluebird
      .try(() => this.createEvent());
  }
  createEvent() {
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      storage.events.insertOne(this.user, attributes, cb)); 
  }

  attributes(attrs: {}): Attributes {
    return R.mergeAll(
      this.fakeAttributes(),
      attrs || {}, 
    );
  }
  fakeAttributes() {
    return {
      id: `c${Charlatan.Number.number(15)}`,
      streamId: this.streamId, 
      time: Charlatan.Date.backward(), 
      duration: 0, 
      type: Charlatan.Helpers.sample(['mass/kg']), 
      tags: [], 
      content: 90, 
    };
  }
}
class FixtureAccess {
  attrs: {}; 
  user: string; 
  
  constructor(user: string, attrs: {}) {
    this.attrs = this.attributes(attrs); 
    this.user = user; 
  }
  
  create() {
    return bluebird
      .try(() => this.createAccess());
  }
  createAccess() {
    const attributes = this.attrs; 
    
    return bluebird.fromCallback((cb) => 
      storage.accesses.insertOne(this.user, attributes, cb)); 
  }

  attributes(attrs: {}): Attributes {
    return R.mergeAll(
      this.fakeAttributes(),
      attrs || {}, 
    );
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

function databaseFixture(mochaContext: Suite) {
  return new Fixture(mochaContext);
}

module.exports = databaseFixture;
