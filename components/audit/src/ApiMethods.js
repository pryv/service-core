/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');

const ALL_METHODS = [
  'getAccessInfo',
  'callBatch',
  'auth.login',
  'auth.logout',
  'auth.register',
  'auth.usernameCheck',
  'auth.emailCheck',
  'auth.delete',
  'accesses.get',
  'accesses.create',
  'accesses.update',
  'accesses.delete',
  'accesses.checkApp',
  'service.info',
  'webhooks.get',
  'webhooks.getOne',
  'webhooks.create',
  'webhooks.update',
  'webhooks.delete',
  'webhooks.test',
  'account.get',
  'account.update',
  'account.changePassword',
  'account.requestPasswordReset',
  'account.resetPassword',
  'followedSlices.get',
  'followedSlices.create',
  'followedSlices.update',
  'followedSlices.delete',
  'profile.getPublic',
  'profile.getApp',
  'profile.get',
  'profile.updateApp',
  'profile.update',
  'streams.get',
  'streams.create',
  'streams.update',
  'streams.delete',
  'events.get',
  'events.getOne',
  'events.create',
  'events.update',
  'events.delete',
  'events.deleteAttachment',
  'system.createUser',
  'system.createPoolUser',
  'system.getUsersPoolSize',
  'system.getUserInfo',
  '*',
  'followedSlices.*',
];

const NOT_AUDITED_METHODS = [
  'service.info',
  'system.createPoolUser',
  'system.getUsersPoolSize',
  'auth.usernameCheck',
];

const AUDITED_METHODS = ALL_METHODS.filter(m => {
  return ! NOT_AUDITED_METHODS.includes(m);
});

const auditedMethodsMap = {};
AUDITED_METHODS.forEach(m => {
  auditedMethodsMap[m] = true;
});
const allMethodsMap = {};
ALL_METHODS.forEach(m => {
  allMethodsMap[m] = true;
});

module.exports = {
  AUDITED_METHODS_MAP: auditedMethodsMap,
  AUDITED_METHODS: AUDITED_METHODS,
  ALL_METHODS: ALL_METHODS,
  ALL_METHODS_MAP: allMethodsMap,
};