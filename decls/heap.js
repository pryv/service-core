/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

declare module 'heap' {
  
  declare type ComparatorFunction<T> = (a: T, b: T) => number;
  declare class Heap<T> {
    constructor(cmp?: ComparatorFunction<T>): Heap<*>;
    
    push(item: T): void;
    pop(): ?T;
    peek(): ?T;
    
    updateItem(item: T): void;
    
    size(): number;
    clone(): Heap<T>;
  }
  
  declare module.exports: typeof Heap;
}