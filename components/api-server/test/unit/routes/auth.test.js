'use strict';
// @flow

// Unit tests for auth.js

/* global describe, it */
const should = require('should');
const express = require('express');

const authMod = require('../../../src/routes/auth');

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
    const {hasProperties} = authMod(express(), null, settings);
    const obj = { a: 1, b: 2 };
    const keys = ['a', 'b'];
    
    it('B671-returns true if all properties exist', function() {
      should(
        hasProperties(obj, keys)
      ).be.ok();
    });
    it('HPT9-returns false if not all properties exist', function() {
      should(
        hasProperties(obj, ['a', 'c'])
      ).be.false(); 
    });
    it('UHVT-returns false if null is given', function() {
      should(
        hasProperties(null, ['a', 'c'])
      ).be.false(); 
    });
    it('TBA4-returns false if a string is given', function() {
      should(
        hasProperties('a string', ['a', 'c'])
      ).be.false(); 
    });
  });
});
