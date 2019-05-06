/*global describe, it */

var treeUtils = require('../src/treeUtils'),
    should = require('should'); // explicit require to benefit from static functions

describe('tree utils', function () {

  var testArray = [
    {
      id: 'root-1',
      parentId: null,
      someProperty: false
    },
    {
      id: 'child-1.1',
      parentId: 'root-1',
      someProperty: false
    },
    {
      id: 'child-1.1.1',
      parentId: 'child-1.1',
      someProperty: false
    },
    {
      id: 'child-1.2',
      parentId: 'root-1',
      someProperty: true
    },
    {
      id: 'root-2',
      parentId: null,
      someProperty: true
    },
    {
      id: 'child-2.1',
      parentId: 'root-2',
      someProperty: false
    }
  ];

  var testTree = [
    {
      id: 'root-1',
      someProperty: false,
      children: [
        {
          id: 'child-1.1',
          someProperty: false,
          children: [
            {
              id: 'child-1.1.1',
              someProperty: false,
              children: []
            }
          ]
        },
        {
          id: 'child-1.2',
          someProperty: true,
          children: []
        }
      ]
    },
    {
      id: 'root-2',
      someProperty: true,
      children: [
        {
          id: 'child-2.1',
          someProperty: false,
          children: []
        }
      ]
    }
  ];

  var invalidArray = [
    {
      badId: 'x'
    }
  ];

  describe('buildTree()', function () {

    it('TVE9-must build a correct tree for a given consistent array', function () {
      treeUtils.buildTree(testArray, true /*strip parent ids*/).should.eql(testTree);
    });

    it('GP0U-must throw an error if objects do not contain the necessary properties', function () {
      /*jshint -W068 */
      (function () { treeUtils.buildTree(invalidArray); }).should.throw();
    });

    it('JBM2-must throw an error if the object in argument is not an array', function () {
      /*jshint -W068 */
      (function () { treeUtils.buildTree(testArray[0]); }).should.throw();
    });

  });

  describe('flattenTree()', function () {

    it('DJ72-must build a correct array for a given tree', function () {
      treeUtils.flattenTree(testTree).should.eql(testArray);
    });

    it('R7FH-must throw an error if the object in argument is not an array', function () {
      /*jshint -W068 */
      (function () { treeUtils.flattenTree(testTree[0]); }).should.throw();
    });

  });

  describe('findInTree()', function () {

    it('9BO4-must return the first item matching the given iterator function', function () {
      var foundItem = treeUtils.findInTree(testTree, function (item) {
        return item.someProperty === true;
      });
      foundItem.should.eql(testTree[0].children[1]);
    });

    it('HDYE-must return null if no item matches the given iterator function', function () {
      var foundItem = treeUtils.findInTree(testTree, function (item) {
        return item.someProperty === 'missing value';
      });
      should.not.exist(foundItem);
    });

  });

  describe('filterTree()', function () {

    it('2MOZ-must return only items matching the given iterator function', function () {
      var filteredTree = treeUtils.filterTree(testTree, true /*keep orphans*/, function (item) {
        return item.someProperty === false;
      });

      filteredTree.should.eql([
        {
          id: 'root-1',
          someProperty: false,
          children: [
            {
              id: 'child-1.1',
              someProperty: false,
              children: [
                {
                  id: 'child-1.1.1',
                  someProperty: false,
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: 'child-2.1',
          someProperty: false,
          children: []
        }
      ]);
    });

  });

  describe('collect()', function () {

    it('LBVZ-must return an array with values matching the iterator function for each item in the tree',
        function () {
      var ids = treeUtils.collect(testTree, function (item) {
        return item.id;
      });

      var expected = testArray.map(function (item) {
        return item.id;
      });
      ids.should.eql(expected);
    });

  });

  describe('expandIds()', function () {

    it('4CVJ-must return an array with the ids passed in argument plus those of all their descendants',
        function () {
      treeUtils.expandIds(testTree, ['root-1']).should.eql([
        'root-1', 'child-1.1', 'child-1.1.1', 'child-1.2'
      ]);
    });

  });

});
