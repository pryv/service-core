
declare interface MemoSeed {
  is<T>(definer: () => T): Memo<T>;
}

declare interface Memo<T> {
  is(definer: () => T): Memo<T>;
  (): T; 
}

declare module 'memo-is' {
  declare type Memo<T> = Memo<T>;
  
  declare module.exports: {
    (): MemoSeed;
  }
}

