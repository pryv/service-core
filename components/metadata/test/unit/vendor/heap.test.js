/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// Tests the heap package as far as we need it.

const assert = require('node:assert');
const Heap = require('heap');

describe('Heap', () => {
  let heap;
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
      assert.strictEqual(heap.pop(), undefined);
    });
  });
});
