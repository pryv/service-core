/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Tests the heap package as far as we need it. 

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 

const Heap = require('heap');

describe('Heap', () => {
  let heap: Heap<number>; 
  beforeEach(() => {
    heap = new Heap(); 
  });
  
  describe('#pop', () => {
    it('[CW89] pops an item', () => {
      heap.push(1);
      const v = heap.pop(); 
      
      assert.strictEqual(v, 1);
    });
    it('[S15J] returns null if the heap is empty', () => {
      assert.isUndefined(heap.pop());
    });
  });
});