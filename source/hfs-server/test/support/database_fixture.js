// @flow

import type {Suite} from 'mocha';

class Fixture {
  mocha: *;
  
  constructor(mochaContext: Suite) {
    this.mocha = mochaContext;
  }
  
  user(name: string, cb: (FixtureUser) => void) {
    const u = new FixtureUser();
    if (cb) cb(u);
    return u; 
  }
}
class FixtureUser {
  stream(name: string, attrs={}, cb) {
    const s = new FixtureStream(name, attrs); 
    if (cb) cb(s);
    return s; 
  }
  access(attrs={}) {
    
  }
}
class FixtureStream {
  event(attrs) {
    const e = new FixtureEvent(attrs); 
    return e; 
  }
}
class FixtureEvent {
  
}

function databaseFixture(mochaContext: Suite) {
  return new Fixture(mochaContext);
}

module.exports = databaseFixture;
