// @flow

import type {EventType, PropertyType} from './interfaces';

type JSONSchema = {
  type: string, 
  properties?: {}, 
  required?: Array<string>,
}

const assert = require('assert');
const R = require('ramda');

const value_types = require('./value_types');

// A complex type like 'position/wgs84' that has several subfields. 
// 
class ComplexType implements EventType {
  schema: JSONSchema;
  _outerType: string; 
  
  constructor(outerType: string, schema: JSONSchema) {
    // We only handle this kind of schema
    assert.ok(schema.type === 'object'); 
    
    // Complex types have a list of required fields and a schema for the object
    // properties: 
    assert.ok(schema.required != null, 
      'Type Schema must have a list of required fields.'); 
    assert.ok(schema.properties != null, 
      'Type Schema must have a properties object.');   
    
    this.schema = schema; 
    this._outerType = outerType;
  }
  
  typeName() {
    return this._outerType;
  }
  
  requiredFields() {
    if (this.schema.required == null) 
      throw new Error('Type Schema must have a list of required fields.');
      
    return this.schema.required; 
  }
  optionalFields() {
    const requiredKeys = this.requiredFields();
    const allKeys = this.fields(); 
    
    return R.reject(
      (el) => R.indexOf(el, requiredKeys) >= 0,
      allKeys);
  }
  fields() {
    if (this.schema.properties == null) 
      throw new Error('Type Schema must have a properties object.');
    return Object.keys(this.schema.properties); 
  }
  
  forField(name: string): PropertyType {
    // TODO
    return value_types('number');
  }
}

module.exports = ComplexType;