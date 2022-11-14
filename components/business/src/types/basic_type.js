/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 



const bluebird = require('bluebird');
const assert = require('assert');

const value_types = require('./value_types');

// A basic type like 'mass/kg'. In high frequency data, this must be stored
// using the column name 'value'.
// 
class BasicType {
  _schema; 
  _outerType; 
  _innerType; 
  
  /** 
   * Construct a basic type. 
   * 
   * @param outerType {string} Type name such as 'mass/kg'
   * @param schema {JSONSchema} Schema to verify content against. 
   */
  constructor(outerType, schema) {
    this._schema = schema; 
    
    this._outerType = outerType; 
    this._innerType = value_types(schema.type);
  }
  
  typeName() {
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
  
  forField(name) {
    // NOTE BasicType only represents types that are not composed of multiple 
    // fields. So the name MUST be 'value' here. 
    assert.ok(name === 'value');
    
    return this._innerType;
  }
  
  isSeries() {
    return false; 
  }
  
  callValidator(
    validator, 
    content
  ) {
    return bluebird.try(() => {
      // Perform coercion into target type first. Then verify using the 
      // validator. This saves us one roundtrip. 
      const value = this._innerType.coerce(content);
      
      return validator.validateWithSchema(value, this._schema);
    });
  }
}

module.exports = BasicType;
