

// WIP - ignore
// filterBy
// metric

const notableSalesDrillDown = DrillDown()

KnowledgeModule('sales', {
    impl: knowledgeModule({
        title: 'ניתוח מחירי מכירות',
        whenToUse: 'כשמשתמש שואל על נתוני מכירות של מוצרים ומבצעים',
        sections: [
            section({
                id:'overview',
                whenToUse: 'on every first user query about sales, unless he specifically asks for a drill down',
                dashboard: [
                    kpis([
                        kpi('total',{label:'סך הכל %$selectedMetric.label%', sql: cubeQuery(' sum(%$selectedMetric%)'), drillDown:notableSalesDrillDown}),
                        kpi(),
                    ])
                ],
                llmAnswer: [
                    dataResponseDoclet(),
                    drillDownTable()
                ],
            }),
            section('sales.branchSalesComparison'),
            section('sales.branchSalesComparison.summary'),
        ]
    })
})