// @flow

// Unit tests for auth.js

/* global describe, it */
const should = require('should');
const express = require('express');

const authMod = require('../../../src/routes/auth');

describe('Authentication', () => {
  const settings = {
    auth: {
      sessionMaxAge: 3600 * 1000,
    },
    http: {
      ip: '127.0.0.1',
    },
    deprecated: {
      auth: {},
    },
    get: () => ({
      str: () => '',
      num: () => 0,
      bool: () => false,
    }),
    has: () => true,
    getCustomAuthFunction: () => { },
  };

  describe('hasProperties', () => {
    // FLOW Mock out the settings object for this unit test
    const { hasProperties } = authMod(express(), { settings });
    const obj = { a: 1, b: 2 };
    const keys = ['a', 'b'];

    it('[IKAI] returns true if all properties exist', () => {
      should(
        hasProperties(obj, keys),
      ).be.ok();
    });
    it('[K2PZ] returns false if not all properties exist', () => {
      should(
        hasProperties(obj, ['a', 'c']),
      ).be.false();
    });
    it('[U2NA] returns false if null is given', () => {
      should(
        hasProperties(null, ['a', 'c']),
      ).be.false();
    });
    it('[WJ7J] returns false if a string is given', () => {
      should(
        hasProperties('a string', ['a', 'c']),
      ).be.false();
    });
  });
});
