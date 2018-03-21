// @flow

/* global describe, it, beforeEach, afterEach */

const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const chai = require('chai');
const assert = chai.assert; 
const bluebird = require('bluebird');
const debug = require('debug')('compile.test');

const rpc = require('../../src/index.js');

describe('Type Compilation', () => {
  let tempdir; 
  
  beforeEach(() => {
    tempdir = tmp.dirSync({ unsafeCleanup: true }); 
  });
  afterEach(() => {
    tempdir.removeCallback(); 
  });
  
  it('compiles a .proto 3 syntax file into a set of flow-type interfaces', async () => {
    const definition = rpc.load('../fixtures/base.proto');
    
    // Write the (flow type) signature to the tempdir
    definition.writeTypeSignature('base.js.flow', tempdir.name);
    
    const typesigPath = path.join(tempdir.name, 'base.js.flow');
    
    const stat = fs.statSync(typesigPath);
    assert.isTrue(stat.isFile());
    
    await assertContains(typesigPath, `
      export interface ISearchResponse {
        results: Array<IResult>;
      }
    `);
  });
});

// Asserts that the file at `path` contains the `content` given. Content is 
// stripped of its indent, which is determined from the first non-empty line. 
// 
async function assertContains(path: string, content: string) {  
  const lines = content.split('\n');

  // Discard all empty lines from head of `lines`. 
  const blank = (s) => /^\s*$/.test(s);
  // remove blank lines from the head of lines
  while (lines.length > 0 && blank(lines[0])) lines.shift(); 
  // remove blank lines from the tail of lines
  while (lines.length > 0 && blank(lines.slice(-1)[0])) lines.pop(); 
  
  // If nothing is left, the expectation was empty. That's an error, because
  // it makes no sense. 
  if (lines.length <= 0) 
    throw new Error('No lines in expectation, failing.');
  
  // assert: lines is not empty and lines[0] is not blank
  
  const mdIndent = lines[0].match(/^(\s*)/);
  if (mdIndent == null) throw new Error('AF: should not be null here.');
  
  const indent = mdIndent[0].length;
  debug('indent is', indent);
  
  // Now prepare to be awed by my api juggling skills. 
  const inputLineStream = eachLine(path);
  const inputLines = [];
  try {
    let c = await inputLineStream.next(); 
    while (! c.done) {
      inputLines.push(c.value);
      c = await inputLineStream.next();
    }
  }
  finally {
    inputLineStream.close();
  }
  
  // Insert implementation of Boyer-Moore here.
  for (let i=0; i<inputLines.length; i++) {
    match_attempt: {
      for (let j=0; j<lines.length; j++) {
        const line = inputLines[i+j];
        const expected = lines[j];
        
        if (line !== expected) break match_attempt; 
      }
      
      // We've matched all of lines against inputLines at position i. 
      return;
    }
  }
  
  throw new Error(`File ${path} doesn't contain the string anywhere.`);
}

function eachLine(path: string): EventEmitterIterator<string> {
  const lineReader = readline.createInterface({
    input: fs.createReadStream(path)
  });
  const streamReader = new EventEmitterIterator(lineReader);
  return streamReader;
}

type Ok<T> = { status: true, value: T };
type Err = { status: false, error: Error };
type Event<T> = Ok<T> | Err;

// An Iterator that allows iterating over the events in a stream. Once 
// `for await` lands in nodejs, this can be used directly, for now, you'll
// need to use it in a while loop. 
// 
// NOTE This doesn't (yet) pause the stream when the buffer is full. If 
//  you have a slow consumer and a fast producer, you will consume a lot
//  of memory. This implementation can easily be modified to do so. 
// 
class EventEmitterIterator<T> /* implements AsyncIterator<T> */ {
  emitter: EventEmitter; 
  buffer: Array<Event<T>>; 
  done: boolean; 
  
  eventData: string; 
  eventEnd: string; 
  eventError: string; 

  constructor(emitter: EventEmitter, data='line', end='close', err='error') {
    this.emitter = emitter; 
    this.buffer = []; 
    this.done = false; 
    
    this.eventData = data; 
    this.eventEnd = end;
    this.eventError = err;

    emitter.on(data, (data) => this.onData(data));
    emitter.on(end, () => this.onEnd());
    emitter.on(err, (error) => this.onError(error)); 
  }

  onData(data: T) {
    debug('event data', data);
    this.buffer.push({ status: true, value: data });
  }
  onEnd() {
    debug('event end');
    this.done = true; 
  }
  onError(err: Error) {
    debug('event error', err);
    this.buffer.push({ status: false, error: err });
  }

  _emitted(): Promise<any> {
    return new bluebird((res, rej) => {
      this.emitter.once(this.eventData, res);
      this.emitter.once(this.eventEnd, res);
      this.emitter.once(this.eventError, rej);
    });
  }

  async next(retry=100): Promise<IteratorResult<T, typeof undefined>> {
    const buffer = this.buffer; 
    debug('next, buffer length', buffer.length);
    debug('head is', buffer[0]);

    if (buffer.length > 0) {
      const nextVal = buffer.shift(); 
      if (! nextVal.status) throw nextVal.error; 

      return bluebird.resolve({ done: false, value: nextVal.value });
    }

    // assert: buffer is empty
    if (this.done) return bluebird.resolve({ done: true, value: undefined });

    // assert: we're not done, but buffer is empty
    
    if (retry <= 0) 
      throw new Error('AF: Recursion failed to terminate after `retry` tries.');
    
    await this._emitted(); 
    return this.next(retry-1); 
  }

  close() {
    this.emitter.close();
  }
}