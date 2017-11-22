'use strict';
// @flow

// Unit tests for auth.js

/* global describe, it */
const should = require('should');
const express = require('express');

const authMod = require('../../../src/routes/auth');

describe('Authentication', function() {
  const authSettings = {
    sessionMaxAge: 3600*1000, 
  };
  const httpSettings = {
    ip: '127.0.0.1',
  };
  
  describe('hasProperties', function() {
    const {hasProperties} = authMod(express(), null, authSettings, httpSettings);
    const obj = { a: 1, b: 2 };
    const keys = ['a', 'b'];
    
    it('returns true if all properties exist', function() {
      should(
        hasProperties(obj, keys)
      ).be.ok();
    });
    it('returns false if not all properties exist', function() {
      should(
        hasProperties(obj, ['a', 'c'])
      ).be.false(); 
    });
    it('returns false if null is given', function() {
      should(
        hasProperties(null, ['a', 'c'])
      ).be.false(); 
    });
    it('returns false if a string is given', function() {
      should(
        hasProperties('a string', ['a', 'c'])
      ).be.false(); 
    });
  });
});
