/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

import { UserSQLiteDatabase } from './UserSQLiteDatabase';

/**
 * UserSQLiteStorage interface — LRU-cached manager for per-user SQLite databases.
 * Async/await API.
 */
export interface UserSQLiteStorage {
  init(): Promise<this>;
  getVersion(): string;
  checkInitialized(): void;
  forUser(userId: string): Promise<UserSQLiteDatabase>;
  deleteUser(userId: string): Promise<void>;
  close(): void;
}

export declare function validateUserSQLiteStorage(instance: any): UserSQLiteStorage;

export declare const REQUIRED_METHODS: string[];
