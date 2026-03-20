/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const helpers = require('../../../test/helpers');
const DBsqlite = require('storages/engines/sqlite/src/DBsqlite');
const conformanceTests = require('platform/test/conformance/PlatformDB.test');

describe('[SQPF] SQLite PlatformDB conformance', () => {
  conformanceTests(async () => {
    await helpers.dependencies.init();
    const db = new DBsqlite();
    await db.init();
    return db;
  });
});
