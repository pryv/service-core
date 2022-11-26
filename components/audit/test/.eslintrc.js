/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  env: {
    mocha: true
  },
  globals: {
    initCore: true,
    initTests: true,
    assert: true,
    cuid: true,
    charlatan: true,
    bluebird: true,
    sinon: true,
    path: true,
    _: true,
    apiMethods: true,
    MethodContextUtils: true,
    fakeAuditEvent: true,
    validation: true,
    AuditFilter: true,
    addAccessStreamIdPrefix: true,
    addActionStreamIdPrefix: true,
    CONSTANTS: true,
    AuditAccessIds: true,
    getNewFixture: true,
    app: true,
    coreRequest: true,
    audit: true
  }
};
