// @flow

import type {EventType, PropertyType} from './interfaces';
import type {ValueType} from './value_types';

const assert = require('assert');
const R = require('ramda');

const errors = require('./errors');
const value_types = require('./value_types');

// A basic type like 'number' or 'boolean'. In high frequency data, this must 
// be stored using the column name 'value'.
// 
class BasicType implements EventType {
  _outerType: string; 
  _innerType: ValueType; 
  
  constructor(outerType: string, innerType: string) {
    this._outerType = outerType; 
    this._innerType = value_types(innerType);
  }
  
  typeName(): string {
    return this._outerType; 
  }
  
  requiredFields() {
    return ['value'];
  }
  optionalFields() {
    return [];
  }
  fields() {
    return this.requiredFields();
  }
  
  forField(name: string): PropertyType {
    // NOTE BasicType only represents types that are not composed of multiple 
    // fields. So the name MUST be 'value' here. 
    assert.ok(name === 'value');
    
    return this._innerType;
  }
}

module.exports = BasicType;
