import { dsls, ns } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/visualized-data.js'

const {
  tgp: { Const,
    'ctx-enricher': { Var }
  },
  common: {
    boolean: { equals },
    data: { asIs, splitByPivot, enrichGroupProps, pipeline }
  },
  test: { Test,
    test: { dataTest }
  },
  react: { VisualizedData,
    'visualized-data': { jbScript }
  }
} = dsls
const { group } = ns

Const('deptEmployees', [
  {name: 'John', dept: 'sales', salary: 50000},
  {name: 'Jane', dept: 'sales', salary: 60000},
  {name: 'Bob', dept: 'tech', salary: 80000},
  {name: 'Alice', dept: 'tech', salary: 75000},
  {name: 'Mike', dept: 'hr', salary: 55000}
])

// script comp: steps computes var after var (each Var reads the vars set by the
// previous steps), result just reads the final var. deptEmployees is a Const, read directly.
const deptReport = VisualizedData('deptReport', {
  impl: jbScript({
    steps: [
      Var('groups', pipeline(
        '%$deptEmployees%',
        splitByPivot('dept'),
        enrichGroupProps([
          group.count('headcount'),
          group.sum('salary', { as: 'totalSalary' })
        ])
      )),
      Var('report', pipeline('%$groups%', '%dept% count=%headcount% total=%totalSalary%'))
    ],
    result: '%$report%'
  })
})

Test('jbScript.calc', {
  impl: dataTest({
    calculate: ctx => deptReport.$run().calc(ctx),
    expectedResult: equals(asIs([
      'sales count=2 total=110000',
      'tech count=2 total=155000',
      'hr count=1 total=55000'
    ]))
  })
})
