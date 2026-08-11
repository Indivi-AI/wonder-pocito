import { dsls, coreUtils, ns } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'

const {
  tgp: { Const, TgpType },
  common: { Data,
    boolean: { equals },
    data: { asIs, enrichGroupProps, list, pipeline, splitByPivot, sum }
  },
  test: { Test,
    test: { dataTest }
  }
} = dsls
const { group } = ns

// Test data
Const('sampleText', 'hello-world-test')
Const('employees', [
  {name: 'John', age: 25, dept: 'sales', salary: 50000},
  {name: 'Jane', age: 30, dept: 'sales', salary: 60000},
  {name: 'Bob', age: 35, dept: 'tech', salary: 80000},
  {name: 'Alice', age: 28, dept: 'tech', salary: 75000},
  {name: 'Mike', age: 40, dept: 'hr', salary: 55000}
])

Const('testDate', new Date('2023-01-15T10:30:00'))
Const('testObject', {name: 'test', value: 42, items: [1, 2, 3]})

// ******** do not delete - used for lang-service tests
const Hello = TgpType('hello','common')
Hello('hi', {
  impl: ''
})

Data('test.test1', {
  impl: ''
})

const myCompForTest = Data('myCompForTest', { // used for lang-service tests
  impl: ''
})

// ********** end of lang-service tests

Test('splitByPivot.basic', {
  impl: dataTest({
    calculate: pipeline('%$employees%', splitByPivot('dept'), '%dept%'),
    expectedResult: equals(asIs(['sales', 'tech', 'hr']))
  })
})

Test('splitByPivot.edgeCases', {
  impl: dataTest({
    calculate: pipeline(list(), splitByPivot('dept')),
    expectedResult: equals(asIs([]))
  })
})

Test('groupBy.count', {
  impl: dataTest({
    calculate: pipeline('%$employees%', splitByPivot('dept'), enrichGroupProps(group.count()), '%count%'),
    expectedResult: equals(asIs([2, 2, 1]))
  })
})

Test('groupBy.aggregations', {
  impl: dataTest({
    calculate: pipeline('%$employees%', splitByPivot('dept'), enrichGroupProps(group.max('salary')), '%maxSalary%'),
    expectedResult: equals(asIs([60000, 80000, 55000]))
  })
})

Test('groupBy.join', {
  impl: dataTest({
    calculate: pipeline('%$employees%', splitByPivot('dept'), enrichGroupProps(group.join('name', {as: 'names'})), '%names%'),
    expectedResult: equals(asIs(['John,Jane', 'Bob,Alice', 'Mike']))
  })
})

Test('groupBy.customProp', {
  impl: dataTest({
    calculate: pipeline('%$employees%', splitByPivot('dept'), enrichGroupProps(group.prop('total', pipeline('%salary%', sum()))), '%total%'),
    expectedResult: equals(asIs([110000, 155000, 55000]))
  })
})

Test('groupBy.multipleProps', {
  impl: dataTest({
    calculate: pipeline(
      '%$employees%', 
      splitByPivot('dept'), 
      enrichGroupProps(group.count('size')), 
      enrichGroupProps(group.max('salary')), 
      '%size%:%maxSalary%'
    ),
    expectedResult: equals(asIs(['2:60000', '2:80000', '1:55000']))
  })
})

Test('groupBy.workflow', {
  impl: dataTest({
    calculate: pipeline(
      '%$employees%',
      splitByPivot('dept'),
      enrichGroupProps(group.count()),
      enrichGroupProps(group.join('name', {as: 'members'})),
      '%dept%(%count%): %members%'
    ),
    expectedResult: equals(asIs(['sales(2): John,Jane', 'tech(2): Bob,Alice', 'hr(1): Mike']))
  })
})
  


Test('groupBy.maxSalary', {
  impl: dataTest({
    calculate: pipeline(
      '%$employees%',
      splitByPivot('dept'),
      enrichGroupProps(group.max('salary')),
      '%dept%:%maxSalary%'
    ),
    expectedResult: equals(asIs(['sales:60000', 'tech:80000', 'hr:55000']))
  })
})
