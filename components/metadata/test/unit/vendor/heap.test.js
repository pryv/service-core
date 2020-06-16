// @flow

// Tests the heap package as far as we need it.

/* global describe, it, beforeEach */

const chai = require('chai');

const { assert } = chai;

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
