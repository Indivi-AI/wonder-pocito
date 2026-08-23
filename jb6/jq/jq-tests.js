import { dsls, coreUtils, ns } from '@jb6/core'
import '@jb6/testing'
import '@jb6/jq'

const {
  tgp: { 
    'ctx-enricher': { Var }
  },
  common: { 
    boolean: { equals },
    data: { asIs, first, jq, pipeline }
  },
  test: { Test,
    test: { dataTest }
  }
} = dsls

Test('jqTest.simple', {
  impl: dataTest(pipeline(Var('myVar', 5), asIs({x: [{y: 2}, {y: 4}]}), jq('.x[].y + $myVar')), equals([7,9]))
})

// Tests jq precedence: `and` binds tighter than `or`
// So: .role == "admin" or .role == "moderator" and .age >= 18
// is parsed as: .role == "admin" or (.role == "moderator" and .age >= 18)
Test('jqTest.andOrPrecedence', {
  impl: dataTest({
    calculate: pipeline(
      asIs([
          {name: 'Alice', age: 17, role: 'admin'},
          {name: 'Bob', age: 30, role: 'user'},
          {name: 'Charlie', age: 17, role: 'moderator'},
          {name: 'David', age: 35, role: 'moderator'}
      ]),
      jq('select(.role == "admin" or .role == "moderator" and .age >= 18)')
    ),
    expectedResult: equals([
      {name: 'Alice', age: 17, role: 'admin'},
      {name: 'David', age: 35, role: 'moderator'}
    ])
  })
})

Test('jqTest.plusOperator', {
  impl: dataTest(pipeline(asIs({a: 1}), jq('. + {b:2}')), equals())
})

Test('jqTest.arrayConcat', {
  impl: dataTest(jq('. + [3,4] | .[]', {data: [1,2]}), equals([1,2,3,4]))
})

Test('jqTest.sliceLast', {
  impl: dataTest(jq('.[-2:] | .[]', {data: [1,2,3,4]}), equals([3,4]))
})

Test('jqTest.pipeAs.min', {
  impl: dataTest(jq('.[0] | as $x | $x', { data: [5] }), equals([5]))
})

Test('jqTest.tryCatch', {
  impl: dataTest(jq('try fromjson catch {error: "failed"}', {data: 'not valid json'}), equals([{error: "failed"}]))
})

Test('jqTest.tryCatchSuccess', {
  impl: dataTest(jq('try fromjson catch {error: "failed"}', {data: '"hello"'}), equals(["hello"]))
})

Test('jqTest.tryWithoutCatch', {
  impl: dataTest(jq('[.[] | try fromjson]', {data: ['1', '"hi"', 'bad']}), equals([[1, "hi"]]))
})

Test('jqTest.varShadowing', {
  impl: dataTest(jq('5 as $x | (10 as $x | $x) as $inner | {inner: $inner, outer: $x}', {data: null}), equals([{inner: 10, outer: 5}]))
})

Test('jqTest.reducePreservesOuterVar', {
  impl: dataTest(jq('5 as $x | reduce .[] as $x (0; . + $x) | . + $x', {data: [1,2,3]}), equals([11]))
})

Test('jqTest.groupBy', {
  impl: dataTest({
    calculate: pipeline(
      asIs({
          people: [
            {name: 'Alice', age: 25, department: 'Engineering'},
            {name: 'Bob', age: 30, department: 'Engineering'},
            {name: 'Charlie', age: 28, department: 'Sales'},
            {name: 'David', age: 35, department: 'Sales'},
            {name: 'Eve', age: 22, department: 'Marketing'}
          ]
      }),
      jq('.people | group_by(.department)'),
      jq('map({department: .[0].department, count: length, avgAge: (map(.age) | add / length), members: map(.name)})'),
      first()
    ),
    expectedResult: equals([
      {department: 'Engineering', count: 2, avgAge: 27.5, members: ['Alice','Bob']},
      {department: 'Sales', count: 2, avgAge: 31.5, members: ['Charlie','David']},
      {department: 'Marketing', count: 1, avgAge: 22, members: ['Eve']}
    ])
  })
})
