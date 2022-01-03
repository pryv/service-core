/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';
// @flow

// Unit tests for auth.js

/* global describe, it */
const should = require('should');
const express = require('express');

const authMod = require('api-server/src/routes/auth/login');

describe('Authentication', function() {
  
  const settings = {
    auth: {
      sessionMaxAge: 3600 * 1000,
    },
    http: {
      ip: '127.0.0.1',
    },
    deprecated: {
      auth: {}
    },
    get: () => { 
      return {
        str: () => { return ''; },
        num: () => { return 0; },
        bool: () => { return false; },
      };
    },
    has: () => { return true; },
    getCustomAuthFunction: () => { },
  };
  
  describe('hasProperties', function() {
    // FLOW Mock out the settings object for this unit test
    const {hasProperties} = authMod(express(), {settings: settings});
    const obj = { a: 1, b: 2 };
    const keys = ['a', 'b'];
    
    it('[IKAI] returns true if all properties exist', function() {
      should(
        hasProperties(obj, keys)
      ).be.ok();
    });
    it('[K2PZ] returns false if not all properties exist', function() {
      should(
        hasProperties(obj, ['a', 'c'])
      ).be.false(); 
    });
    it('[U2NA] returns false if null is given', function() {
      should(
        hasProperties(null, ['a', 'c'])
      ).be.false(); 
    });
    it('[WJ7J] returns false if a string is given', function() {
      should(
        hasProperties('a string', ['a', 'c'])
      ).be.false(); 
    });
  });
});
