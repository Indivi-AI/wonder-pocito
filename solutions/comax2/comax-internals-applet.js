import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/reveal.js'
import '@wonder/ui/zui/zui-dsl.js'
import './comax-cube.js'
import './kpis-sql-zui.js'
import '@wonder/bi/benchmark/bi-benchmark-applet.js'

const {
  tgp: { Const, 'ctx-enricher': { loadReveal, Var } },
  react: { ReactComp, 'react-comp': { comp, zoomingSvg, kpisSqlZui, comaxBenchmarkApplet } },
  zui: {
    MetadataLayout, 'metadata-layout': { twoLayerMetadataLayout },
    'zoom-views': { zoomViews }, 'item-view': { itemView }
  }
} = dsls

const symbols = {
  department: '🗂️', group: '🧩', supplier: '🚚', model: '🧱', item: '📦', receipt: '🧾', line: '№',
  store: '🏬', customer: '👤', employee: '🧑‍💼', agent: '🤝', promotion: '🏷️', date: '📅', quantity: '🔢',
  sales: '💵', name: '🔤', parentDepartment: '🗂️⬆️', parentGroup: '🧩⬆️', regularCost: '💰◯', franchiseCost: '💰🏪'
}
const symbolNames = Object.fromEntries(Object.entries(symbols).map(([name, symbol]) =>
  [symbol, name.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)]).concat([
  ['·', 'combined with'], ['↦', 'these keys determine this value']
]))

Const('comaxInternalsMetadata', {
  icons: {
    departments: ['merchandise departments', 'M3 5h18v14H3z|M3 10h18M9 5v14M15 5v14'],
    productGroups: ['product assortment and grouping', 'M3 7l5-3 5 3-5 3z|M13 7l5-3 3 2-5 3z|M8 10v6l5 3 5-3V9'],
    suppliers: ['supplier and model lookup', 'M3 6h11v10H3z|M14 10h4l3 3v3h-7z|M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4'],
    products: ['sellable product master', 'M4 12l8-8h7v7l-8 8z|M15.5 7.5h.01'],
    lines: ['receipt line item', 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z|M9 7h6M9 11h6M8 14h8v3H8z'],
    headers: ['customer receipt', 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z|M9 7h6M9 11h6M9 15h6'],
    regularCost: ['regular cost relation', 'M5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M8 10h8l-2-2M16 14H8l2 2'],
    franchiseCost: ['franchise cost relation', 'M5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M8 10h8l-2-2M16 14H8l2 2'],
    stores: ['retail location', 'M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z|M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
    entities: ['customer, employee, and agent lookup', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20c0-4 2-6 6-6s6 2 6 6M17 11a2.5 2.5 0 1 0 0-5M16 14c3 0 5 2 5 5'],
    promotions: ['happy customer promotion', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M8.5 10h.01M15.5 10h.01M8 14c2 3 6 3 8 0']
  },
  graph: {
    children: [
      ['departments', 'Departments', [
        [symbols.department, 'C'], '↦', [symbols.parentDepartment, 'DepartmentTop'], '·', [symbols.name, 'Nm']
      ], 'dim', 18, 39, 2, 3765],
      ['productGroups', 'Groups / Subgroups', [
        [symbols.group, 'C'], '↦', [symbols.parentGroup, 'GroupC'], '·', [symbols.name, 'Nm']
      ], 'dim', 16, 506, 2, 9715],
      ['suppliers', 'Suppliers / Models', [
        [symbols.supplier, 'C'], '·', [symbols.model, 'C'], '↦', [symbols.name, 'Nm']
      ], 'dim', 47, 3191, 2, 80673],
      ['products', 'Prt', [
        [symbols.item, 'C'], '↦', [symbols.department, 'DepartmentC'], '·',
        [symbols.group, 'GroupC / GroupTtC'], '·', [symbols.supplier, 'Spk'], '·', [symbols.model, 'DegemC']
      ], 'dim', 64, 75577, 1, 2235754],
      ['lines', 'KupaDoc_Lines-mqy', [
        [symbols.receipt, 'KupaDocC'], '·', [symbols.line, 'C / Line'], '↦', [symbols.item, 'PrtC'], '·',
        [symbols.promotion, 'MivzaNo'], '·', [symbols.quantity, 'Cmt'], '·', [symbols.sales, 'Scm / VatAmount']
      ], 'fact', 19, 69771038, 8, 973744532],
      ['headers', 'KupaDoc_Header-mqy', [
        [symbols.receipt, 'C'], '↦', [symbols.store, 'StoreC'], '·', [symbols.customer, 'CustomerC'], '·',
        [symbols.date, 'DateDoc'], '·', [symbols.employee, 'OvedC'], '·', [symbols.agent, 'SochenC']
      ], 'fact', 28, 10265013, 9, 177869864],
      ['regularCost', 'DailyPriceCost', [
        [symbols.item, 'ItemID'], '·', [symbols.store, 'StoreID'], '·',
        [symbols.date, 'DateDoc'], '↦', [symbols.regularCost, 'FinalRegularCostPrice']
      ], 'cost', 32, 8958997, 10, 113467709],
      ['franchiseCost', 'DailyPriceCost_Zakyan', [
        [symbols.item, 'ItemID'], '·', [symbols.store, 'StoreID'], '·', [symbols.customer, 'CustomerID'], '·',
        [symbols.promotion, 'MivzaC'], '·', [symbols.date, 'DateDoc'], '↦', [symbols.franchiseCost, 'FinalCostPrice']
      ], 'cost', 18, 174005, 2, 870872],
      ['stores', 'Store', [
        [symbols.store, 'C'], '↦', [symbols.name, 'Nm']
      ], 'dim', 28, 28, 1, 6125],
      ['entities', 'Idx / Idx_Grp', [
        [symbols.customer, 'C'], '·', [symbols.employee, 'C'], '·', [symbols.agent, 'C'], '↦',
        [symbols.name, 'Nm'], '·', [symbols.group, 'IdxGrp / C']
      ], 'dim', 20, 44144, 2, 504316],
      ['promotions', 'Mivza / Mivza_Svg', [
        [symbols.promotion, 'C'], '↦', [symbols.group, 'SivugC / C'], '·', [symbols.name, 'Nm']
      ], 'dim', 21, 20779, 2, 574254]
    ],
    edges: [
      ['department-product', 'departments', 'products', '{s} C 1 ← N {t} DepartmentC'],
      ['group-product', 'productGroups', 'products', '{s} C 1 ← N {t} GroupC / GroupTtC'],
      ['supplier-product', 'suppliers', 'products', '{s} C 1 ← N {t} Spk / DegemC'],
      ['product-line', 'products', 'lines', '{s} C 1 ← N {t} PrtC'],
      ['header-line', 'headers', 'lines', '{s} C 1 ← N {t} KupaDocC'],
      ['line-cost', 'lines', 'regularCost', '{s} PrtC + header StoreC/DateDoc → {t} ItemID/StoreID/DateDoc'],
      ['line-franchise', 'lines', 'franchiseCost', '{s} PrtC/MivzaNo + header StoreC/CustomerC/DateDoc → {t}'],
      ['header-store', 'headers', 'stores', '{s} StoreC N → 1 {t} C'],
      ['header-entity', 'headers', 'entities', '{s} CustomerC/OvedC/SochenC N → 1 {t} C'],
      ['line-promotion', 'lines', 'promotions', '{s} MivzaNo N → 1 {t} C']
    ]
  },
  schemas: {
    departments: {
      source: 'Departments.parquet + DepartmentsTop.parquet',
      primitiveData: ['Nm', 'eNm', 'DepartmentTop', 'BuyerId'],
      primitiveExample: { Nm: 'פירות וירקות ללא מע"מ', eNm: '', DepartmentTop: 0, BuyerId: null },
      groups: {
        Departments: [
          'C:BIGINT,Code:BIGINT,Nm:VARCHAR,DepartmentTop:BIGINT,Company:BIGINT,SwZakyan:BIGINT,eNm:VARCHAR,ByDateUpd:TIMESTAMP',
          'NotInProfitCalc:BIGINT,DateStop:TIMESTAMP,SwNoShowInQuery:BIGINT,SwNoMaam:BIGINT,BuyerId:VARCHAR'
        ].join(','),
        DepartmentsTop: 'C:BIGINT,Code:BIGINT,Nm:VARCHAR,Company:BIGINT,ByDateUpd:TIMESTAMP'
      }
    },
    productGroups: {
      source: 'PrtGroups.parquet + PrtGroupTt.parquet',
      primitiveData: ['Nm', 'eNm', 'DepartmentC', 'GroupC', 'Kanyan'],
      primitiveExample: { Nm: 'פיצוחים,אגוזים וגרעינים במשקל', eNm: null, DepartmentC: 24, GroupC: 372, Kanyan: null },
      groups: {
        PrtGroups: 'C:BIGINT,Code:BIGINT,Nm:VARCHAR,DepartmentC:BIGINT,Company:BIGINT,eNm:VARCHAR,ByDateUpd:TIMESTAMP,BuyerId:BIGINT',
        PrtGroupTt: 'C:BIGINT,Code:BIGINT,Nm:VARCHAR,GroupC:BIGINT,Company:BIGINT,eNm:VARCHAR,ByDateUpd:TIMESTAMP,Kanyan:VARCHAR'
      }
    },
    suppliers: {
      source: 'Suppliers.parquet + PrtDegem.parquet',
      primitiveData: ['Nm', 'Code', 'Email', 'Tel', 'SpkType', 'PaymentTerms'],
      primitiveExample: { Nm: 'סינואני רצון בע"מ', Code: 121002, Email: null, Tel: '052-3860691', SpkType: null, PaymentTerms: null },
      groups: {
        Suppliers: [
          'C:BIGINT,Mechiron:BIGINT,Nm:VARCHAR,Company:BIGINT,UserAtt:BIGINT,AczDis:DOUBLE,ByDate:TIMESTAMP,SpkType:BIGINT',
          'Mtba:VARCHAR,Street:VARCHAR,Street_No:BIGINT,Email:VARCHAR,Tel:VARCHAR,Code:BIGINT,eNm:VARCHAR,eCity:VARCHAR',
          'Lang:VARCHAR,WebAddress:VARCHAR,BankName:VARCHAR,BankSnifNo:VARCHAR,BankSnifAddress:VARCHAR,BankAccountNo:VARCHAR',
          'BankAccountName:VARCHAR,BankCode:VARCHAR,BankSwiftCode:VARCHAR,BankIBonNo:VARCHAR,BankAbaRouting:VARCHAR',
          'TradeHandler:BIGINT,PropertyTherapist:VARCHAR,DateStop:TIMESTAMP,DateStopSaleBuy:TIMESTAMP,DateStopHechzer:TIMESTAMP',
          'ByDateUpd:TIMESTAMP,SectorC:VARCHAR,Pasul_Store:BIGINT,UserAttAcc:BIGINT,UserKanyan:VARCHAR,PaymentTerms:VARCHAR,Pelefon:VARCHAR'
        ].join(','),
        PrtDegem: 'C:BIGINT,Code:VARCHAR,Nm:VARCHAR,Company:BIGINT,ByDateUpd:TIMESTAMP,DafPic:VARCHAR,Pic1:VARCHAR,SwPicType:VARCHAR'
      }
    },
    lines: {
      source: 'KupaDoc_Lines-mqy.parquet',
      partition: ['sale_month', 'sale_date'],
      primitiveData: ['Cmt', 'Scm', 'VatAmount', 'ScmAlut', 'AczDisLine', 'MhrLine'],
      primitiveExample: { Cmt: 1, Scm: 6, VatAmount: 0.8717, ScmAlut: 0, AczDisLine: 0, MhrLine: 6 },
      inferredGroups: ['Source fields'],
      groups: {
        'Keys & joins': 'C:BIGINT,KupaDocC:BIGINT,PrtC:BIGINT,MivzaNo:BIGINT',
        'Time & pruning': 'sale_date:DATE,sale_month:VARCHAR,ByDateUpd:TIMESTAMP',
        Measures: 'Cmt:DOUBLE,Scm:DOUBLE,ScmAlut:DOUBLE,AczDisLine:DOUBLE,MhrLine:DOUBLE,VatAmount:DOUBLE',
        'Source fields': 'Line:BIGINT,Company:BIGINT,Mirsham_PhrmaSoft:BIGINT,Sochen:VARCHAR,Store:BIGINT'
      }
    },
    headers: {
      source: 'KupaDoc_Header-mqy.parquet',
      partition: ['sale_month', 'sale_date'],
      primitiveData: ['DateDoc', 'Scm', 'TotalCmt', 'StoreC', 'CustomerC', 'sale_date'],
      primitiveExample: { DateDoc: '2022-01-02', Scm: 17.94, TotalCmt: 4, StoreC: 13, CustomerC: 7370, sale_date: '2022-01-02' },
      inferredGroups: ['Receipt & payment', 'Source fields'],
      groups: {
        'Keys & joins': 'C:BIGINT,StoreC:BIGINT,CustomerC:BIGINT,OvedC:BIGINT,SochenC:VARCHAR',
        'Time & pruning': 'DateDoc:TIMESTAMP,Hour:BIGINT,sale_date:DATE,sale_month:VARCHAR,ByDateUpd:TIMESTAMP',
        Measures: 'Scm:DOUBLE,ScmMaam:DOUBLE,TotalCmt:DOUBLE,AczMaam_Tlush:DOUBLE',
        'Receipt & payment': 'TlushNo:BIGINT,KupaNo:BIGINT,TashlumMezuman:VARCHAR,TashlumShek:VARCHAR,TashlumAshrai:VARCHAR,TashlumOther:VARCHAR',
        'Source fields': 'Company:BIGINT,KupaType:VARCHAR,SwInvElectronit:BIGINT,Ref:BIGINT,DocType:BIGINT,MOADON_NO:BIGINT,MlayHzm:VARCHAR'
      }
    },
    regularCost: {
      source: 'DailyPriceCost.parquet',
      primitiveData: ['FinalRegularCostPrice', 'FinalRegularCostSource', 'SupplierRefund', 'MhrAlutNetoT'],
      primitiveExample: { FinalRegularCostPrice: 2.45, FinalRegularCostSource: 'Company', SupplierRefund: 0, MhrAlutNetoT: 0 },
      inferredGroups: ['Cost inputs', 'Source control'],
      groups: {
        'Join & range keys': 'StoreID:BIGINT,ItemID:BIGINT,DateDoc:BIGINT',
        'Resolved cost': 'FinalRegularCostPrice:DOUBLE,FinalRegularCostSource:VARCHAR',
        'Cost inputs': [
          'SupplierRefund:DOUBLE,MhrAlutNetoT:DOUBLE,MhrAlutBrutoT:DOUBLE,Mhr_Neto:VARCHAR,MhrNeto_Neto:VARCHAR',
          'Mhr_Neto_Final:VARCHAR,MhrNeto_Neto_Final:VARCHAR,Mhr_Bruto:VARCHAR,MhrBruto_AczDis:VARCHAR,Mhr_Bruto_Final:VARCHAR',
          'Mhr_Avg:VARCHAR,PL_Avg_AczDis:VARCHAR,Mhr_Avg_Final:VARCHAR,Mhr_Spk:DOUBLE,PL_Spk_AczDis:DOUBLE,Mhr_Spk_Final:DOUBLE',
          'MhrCompany:DOUBLE,MhrCompany_Neto:DOUBLE,MhrCompany_AczDis:DOUBLE,PL_Company_Final:DOUBLE,PL_Company_Neto_Final:DOUBLE',
          'RewardCharge:DOUBLE,OperatingReturn:DOUBLE,MhrNeto_AczDis:VARCHAR'
        ].join(','),
        'Source control': 'KeyPrices:VARCHAR,LoadDate:TIMESTAMP,ByDateUpd:TIMESTAMP'
      }
    },
    franchiseCost: {
      source: 'DailyPriceCost_Zakyan.parquet',
      primitiveData: ['FinalCostPrice', 'FinalCostSource', 'TotalScmAlut', 'SupplierRefund'],
      primitiveExample: { FinalCostPrice: 6.6, FinalCostSource: 'Company', TotalScmAlut: 0, SupplierRefund: 0 },
      inferredGroups: ['Cost inputs', 'Source control'],
      groups: {
        'Join & range keys': 'StoreID:BIGINT,ItemID:BIGINT,CustomerID:BIGINT,MivzaC:BIGINT,DateDoc:BIGINT',
        'Resolved cost': 'FinalCostPrice:DOUBLE,FinalCostSource:VARCHAR',
        'Cost inputs': [
          'TotalScmAlut:DOUBLE,TotalScmAlutBruto:DOUBLE,TotalCount:DOUBLE,MhrAlutNetoT:DOUBLE,MhrAlutBrutoT:DOUBLE',
          'SupplierRefund:DOUBLE,RewardCharge:DOUBLE,OperatingReturn:DOUBLE'
        ].join(','),
        'Source control': 'KeyPricesZakyan:VARCHAR,ByDateUpd:TIMESTAMP,LoadDate:TIMESTAMP'
      }
    },
    products: {
      source: 'Prt.parquet',
      primitiveData: ['Nm', 'BarCode', 'Code', 'Makat', 'EngNm', 'TeurPrtYazran'],
      primitiveExample: { Nm: 'סלמון טרי שלם', BarCode: 55000, Code: 55000, Makat: '2339000504', EngNm: null, TeurPrtYazran: null },
      inferredGroups: ['Identity', 'Lifecycle', 'Packaging & dimensions', 'Flags', 'Source fields'],
      groups: {
        'Keys & joins': 'C:BIGINT,DepartmentC:BIGINT,GroupC:BIGINT,GroupTtC:BIGINT,DegemC:BIGINT,Spk:BIGINT',
        Identity: 'Nm:VARCHAR,BarCode:BIGINT,Code:BIGINT,Makat:VARCHAR,EngNm:VARCHAR,TeurPrtYazran:VARCHAR',
        Lifecycle: 'DateOpen:TIMESTAMP,DateStop_Buy:TIMESTAMP,DateStop_Sell:TIMESTAMP,ArchiveDate:TIMESTAMP,ArchiveDateOut:INTEGER',
        'Packaging & dimensions': [
          'Mida:BIGINT,Gimor:BIGINT,Godel:BIGINT,Nefach:DOUBLE,CmtAmr:DOUBLE,CmtAmr_N:DOUBLE,CmtAmr3:DOUBLE,Amara2_N:DOUBLE',
          'MidaAmrInKod:VARCHAR,MidaAmrIn_N:DOUBLE,PrtAriza:BIGINT,CmtMinForSell:DOUBLE'
        ].join(','),
        Flags: [
          'SwKlali:BIGINT,SwShakil:BIGINT,SwNotMlay:BIGINT,SwReturnToSupplier:BIGINT,SwMachonTeken:VARCHAR,SwNoShow:BIGINT',
          'SwMAX20:BIGINT,SwPicType:BIGINT,SwHokMazon_NoShow:BIGINT,SwAlcohol:BIGINT,SwMustCmtKupa:BIGINT'
        ].join(','),
        'Source fields': [
          'Izran:BIGINT,Nosaf:BIGINT,Nosaf_2:BIGINT,Nosaf_3:BIGINT,Nosaf_6:BIGINT,Nosaf_7:BIGINT,Nosaf_8:BIGINT',
          'Nosaf_9:BIGINT,Nosaf_10:BIGINT,Shonot:BIGINT,ShonotC:BIGINT,Company:BIGINT,PrtType:BIGINT,Prt_Halufi:VARCHAR',
          'Prt_Nosaf_4:BIGINT,Prt_Nosaf_5:BIGINT,DateStop_HzmBuy:TIMESTAMP,MumlazForHzm:DOUBLE,ByDateUpd:TIMESTAMP',
          'BigPic:VARCHAR,SmallPic:VARCHAR,RemarkGeneral:VARCHAR,StatusPrt_MAX:VARCHAR,Derog:BIGINT'
        ].join(',')
      }
    },
    stores: {
      source: 'Store.parquet',
      primitiveData: ['Nm', 'Code', 'Store_GrpNm', 'City', 'Area', 'StoreType'],
      primitiveExample: { Nm: 'כץ פתח תקווה', Code: 1, Store_GrpNm: 'מגוון D', City: 0, Area: 0, StoreType: 0 },
      inferredGroups: ['Identity', 'Location & size', 'Lifecycle', 'Source fields'],
      groups: {
        'Keys & joins': 'C:BIGINT,SnifC:BIGINT,CompanyC:BIGINT,Store_Grp:BIGINT,Store_GrpC:BIGINT',
        Identity: 'Nm:VARCHAR,Code:BIGINT,Store_GrpNm:VARCHAR,WarehouseDescription:VARCHAR,StoreType:BIGINT',
        'Location & size': 'City:BIGINT,Area:DOUBLE,AreaBruto:DOUBLE,Kordinatot_N:VARCHAR,Kordinatot_E:VARCHAR',
        Lifecycle: 'DateOpenStore:TIMESTAMP,DateCloseStore:VARCHAR,DateNotShowInQry:VARCHAR,ToDateNotShowInQry:VARCHAR',
        'Source fields': [
          'SwSrak:BIGINT,SwStoreNoMaam:BIGINT,SwNotShowInQry:BIGINT,MechironS:BIGINT,MhrBuyLast_Bruto_AczDis_Type:VARCHAR',
          'MechironSMemuzaNa:VARCHAR,ByDateUpd:TIMESTAMP,LastPurchasePrice:BIGINT,OpticTestRooms:VARCHAR'
        ].join(',')
      }
    },
    entities: {
      source: 'Idx.parquet + Idx_Grp.parquet',
      primitiveData: ['Nm', 'Code', 'Type', 'IdxGrp', 'BranchID'],
      primitiveExample: { Nm: 'סינואני רצון בעמ', Code: 121002, Type: 2, IdxGrp: 256, BranchID: null },
      groups: {
        Idx: [
          'C:BIGINT,BranchID:BIGINT,Code:BIGINT,Nm:VARCHAR,Type:BIGINT,IdxGrp:BIGINT,Company:BIGINT,Mechiron:BIGINT',
          'Idx_Av:VARCHAR,ByDateUpd:TIMESTAMP,BalanceSheetItem:VARCHAR,ProfitType:VARCHAR,CompanyC:BIGINT'
        ].join(','),
        Idx_Grp: 'C:BIGINT,CompanyC:BIGINT,Code:BIGINT,Nm:VARCHAR,Type:BIGINT,Company:BIGINT,ByDateUpd:TIMESTAMP'
      }
    },
    promotions: {
      source: 'Mivza.parquet + Mivza_Svg.parquet',
      primitiveData: ['Nm', 'TextForWeb', 'FromDate', 'ToDate', 'MivzaTypeNm', 'Cmt', 'Scm'],
      primitiveExample: {
        Nm: 'פרורי לחם גריסיני 200 גרם 2 ב-10.90 ש"ח', TextForWeb: 'פרורי לחם 3 ב-10',
        FromDate: '2021-10-21', ToDate: '2023-01-31', MivzaTypeNm: 'כמות בסכום', Cmt: 2, Scm: 10.9
      },
      groups: {
        Mivza: [
          'Company:BIGINT,Kod:BIGINT,Nm:VARCHAR,TextForWeb:VARCHAR,FromDate:TIMESTAMP,ToDate:TIMESTAMP,MivzaType:BIGINT',
          'MivzaTypeNm:VARCHAR,C:BIGINT,ByDateUpd:TIMESTAMP,Cmt:DOUBLE,Scm:DOUBLE,K_AczDis:DOUBLE,K_ScmDis:VARCHAR',
          'CustomerGroupList:VARCHAR,SivugC:BIGINT,MinCmt:DOUBLE'
        ].join(','),
        Mivza_Svg: 'C:BIGINT,Code:BIGINT,Nm:VARCHAR,ByDateUpd:TIMESTAMP'
      }
    }
  },
  fieldFacts: {
    'lines.C': ['source row identifier', 'latestMonthRaw', true],
    'lines.KupaDocC': ['joins KupaDoc_Header-mqy.C', 'weeklyTrend,topBranches,promotionPerformance + every base query'],
    'lines.PrtC': ['joins Prt.C', 'topItems + every base query'],
    'lines.MivzaNo': ['joins Mivza.C and franchise cost MivzaC', 'kpis,costAudit,marginByBranch,missingCostCoverage,profitYoYByBranch,promotionPerformance'],
    'lines.Cmt': ['quantity; cost_amount multiplies Cmt by resolved cost', 'kpis,costAudit,marginByBranch,profitYoYByBranch,topItems'],
    'lines.Scm': ['gross line amount; net_sales_amount = Scm - VatAmount', 'all sales/profit benchmarks'],
    'lines.VatAmount': ['VAT amount; net_sales_amount = Scm - VatAmount', 'all sales/profit benchmarks'],
    'lines.sale_date': ['physical MQY pruning date', 'every base query + latestMonthRaw'],
    'headers.C': ['joins KupaDoc_Lines-mqy.KupaDocC', 'every base query'],
    'headers.StoreC': ['joins Store.C and both cost StoreID fields', 'every base query'],
    'headers.CustomerC': ['joins Idx.C and franchise cost CustomerID', 'cost/profit benchmarks'],
    'headers.DateDoc': ['receipt timestamp; derives calendar dimensions and cost DateDoc key', 'every base query'],
    'headers.sale_date': ['physical MQY pruning date', 'every base query'],
    'regularCost.StoreID': ['joins header StoreC', 'cost/profit benchmarks'],
    'regularCost.ItemID': ['joins line PrtC', 'cost/profit benchmarks'],
    'regularCost.DateDoc': ['joins YYYYMMDD derived from header DateDoc', 'cost/profit benchmarks'],
    'regularCost.FinalRegularCostPrice': ['regular cost fallback', 'kpis,costAudit,marginByBranch,missingCostCoverage,profitYoYByBranch'],
    'franchiseCost.FinalCostPrice': ['first-priority franchise cost', 'kpis,costAudit,marginByBranch,missingCostCoverage,profitYoYByBranch'],
    'products.C': ['joins line PrtC', 'every base query'],
    'products.Nm': ['cube item dimension', 'topItems'],
    'stores.C': ['joins header StoreC', 'every base query'],
    'stores.Nm': ['cube branch and warehouse dimensions', 'marginByBranch,missingCostCoverage,branchYoY,holidayComparison,topBranches']
  },
  fieldProfiles: {
    'lines.Cmt': 'sample 50,000 · min -50 · p50 1 · max 24 · null 0%',
    'lines.Scm': 'sample 50,000 · min -88.3 · p50 9.90 · max 360 · null 0%',
    'lines.VatAmount': 'sample 50,000 · min -12.83 · p50 1.01 · max 52.31 · null 0%',
    'lines.MivzaNo': 'sample 50,000 · ≈219 distinct · p50 0 · max 2485 · null 0%',
    'lines.sale_date': 'sample 50,000 · 2023-01-01 → 2023-01-07 · null 0%'
  }
})

ReactComp('comaxInternals', {
  params: [
    {id: 'layout', type: 'metadata-layout<zui>', dynamic: true, defaultValue: twoLayerMetadataLayout()}
  ],
  impl: comp(
    Var('metadataLayout', '%$layout%'),
    Var('tableZoomViews', zoomViews(
      itemView(0, { hFunc: ctx => ctx.vars.renderTable(ctx, 'overview') }),
      itemView(400, { hFunc: ctx => ctx.vars.renderTable(ctx, 'groups') }),
      itemView(770, { hFunc: ctx => ctx.vars.renderTable(ctx, 'details') })
    )),
    {
    enrichCtx: loadReveal(),
    hFunc: (ctx, { reveal, react: { h, hh, useEffect, useRef }, metadataLayout, tableZoomViews }) => () => {
      const metadata = ctx.exp('%$comaxInternalsMetadata%')
      const graph = {
        children: metadata.graph.children.map(([id, label, relation, kind, fields, rows, rowGroups, bytes]) => {
          const meta = { fields, rows, rowGroups, bytes }
        const weight = Math.max(0, Math.log10(meta.bytes) - 3), layer = kind === 'dim' ? 'lookup' : 'main'
        return {
            id, label, relation, schema: metadata.schemas[id], kind, meta, layer,
          width: 180 + weight * 18, height: 88 + weight * 8
        }
        }),
        edges: metadata.graph.edges.map(([id, source, target, template]) => {
          const text = template.replace('{s}', '').replace('{t}', '').replace(/\s+/g, ' ').trim()
          return {
            id, sources: [source], targets: [target], text,
            labels: [{ id: `${id}-label`, text, width: Math.max(72, text.length * 6.5 + 30), height: 17 }]
          }
        })
      }
      const host = useRef(), comaxErd = metadataLayout(ctx.setData(graph))
      useEffect(() => {
        const { disconnect } = reveal.mount(host.current, { width: '100%', height: '100%', margin: 0 })
        return disconnect
      }, [])
      const active = new Set(['products', 'lines', 'headers', 'regularCost', 'franchiseCost', 'stores'])
      const colors = { fact: '#0369a1', dim: '#15803d', cost: '#b45309', franchiseCost: '#7c3aed' }
      const pointPath = section => [section.startPoint, ...(section.bendPoints || []), section.endPoint]
        .map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
      const Erd = ({ dynamic }) => hh(ctx, zoomingSvg, {
        width: comaxErd.width, height: comaxErd.height,
        zoomingVars: [
          { id: 'columns', calc: scale => Math.max(0, Math.min(1, (scale - 1) * 4)) },
          { id: 'joins', calc: scale => Math.max(0, Math.min(1, (scale - 1.1) * 4)) },
          { id: 'moreFields', calc: scale => Math.max(0, Math.min(1, (scale - 2) * 3)) },
          { id: 'rows', calc: scale => Math.max(0, Math.min(1, (scale - 2.3) * 3)) },
          { id: 'fieldDetails', calc: scale => Math.max(0, Math.min(1, (scale - 3) * 2)) },
          { id: 'fontSize', calc: scale => `${11 / scale}px` }
        ],
        content: zctx => {
          const fontSize = 'var(--fontSize)'
          const hotCard = zctx.vars.zoomState.hotCard
          const iconPaths = id => metadata.icons[id][1].split('|')
          const svgIcon = (id, x, y, size = 13) => h('g', {
            transform: `translate(${x},${y}) scale(${size / 24})`, color: '#bae6fd'
          }, ...iconPaths(id).map(d => h('path', {
            d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
          })))
          const htmlIcon = id => h('svg', {
            viewBox: '0 0 24 24', title: metadata.icons[id][0], style: { width: '1.4em', height: '1.4em', flex: '0 0 auto' }
          }, ...iconPaths(id).map(d => h('path', {
            d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
          })))
          const layerLabel = (layer, text) => {
            const nodes = comaxErd.children.filter(node => node.layer === layer)
            return h('text', {
              x: Math.min(...nodes.map(node => node.x)), y: Math.min(...nodes.map(node => node.y)) - 10,
              fill: '#64748b', fontSize, fontWeight: 700
            }, text)
          }
          return h('g', {},
      layerLabel('main', 'MAIN DATA'),
      layerLabel('lookup', 'LOOKUPS'),
      ...comaxErd.edges.flatMap(edge => {
        const on = !dynamic || edge.sources.includes(hotCard) || edge.targets.includes(hotCard)
          || edge.sources.every(x => active.has(x)) && edge.targets.every(x => active.has(x))
        return (edge.sections || []).map(section => h('path', {
          d: pointPath(section), fill: 'none', stroke: on ? '#38bdf8' : '#334155', strokeWidth: on ? 3 : 1.5
        })).concat(edge.labels.map(label => h('g', {
          opacity: `calc(var(--joins) * ${on ? 1 : .18})`, style: { transition: 'opacity .3s' }
        },
          h('rect', { x: label.x - 3, y: label.y, width: label.width + 6, height: 17, rx: 4, fill: '#071521' }),
          svgIcon(edge.sources[0], label.x, label.y + 2),
          h('text', {
            x: label.x + label.width / 2, y: label.y + 12, fill: '#bae6fd',
            fontSize: 'var(--fontSize)', textAnchor: 'middle'
          }, edge.text),
          svgIcon(edge.targets[0], label.x + label.width - 13, label.y + 2))))
      }),
      ...comaxErd.children.map(node => {
        const on = !dynamic || active.has(node.id) || hotCard === node.id
        const size = node.meta.bytes >= 1e6 ? `${(node.meta.bytes / 2 ** 20).toFixed(1)} MB`
          : `${(node.meta.bytes / 2 ** 10).toFixed(1)} KB`
        const rows = Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(node.meta.rows)
        const groups = Object.entries(node.schema?.groups || {}).map(([name, fields]) => ({
          name, inferred: node.schema.inferredGroups?.includes(name),
          fields: fields.split(',').map(field => {
            const [name, type] = field.split(':'), key = `${node.id}.${name}`
            return { name, type, fact: metadata.fieldFacts[key], profile: metadata.fieldProfiles[key] }
          })
        }))
        const header = () => h('div', { style: {
          display: 'flex', alignItems: 'center', gap: '.5em', padding: '.55em .7em',
          borderLeft: `.35em solid ${colors[node.id] || colors[node.kind]}`, borderBottom: '1px solid #334155',
          background: '#111c2e', fontWeight: 700
        }},
          h('span', {
            title: metadata.icons[node.id][0], style: { color: colors[node.id] || colors[node.kind], display: 'flex' }
          }, htmlIcon(node.id)),
          h('span', { style: { flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } }, node.label),
          node.schema?.partition && h('span', {
            title: `time partitioned — ${node.schema.partition.join(', ')}`,
            'aria-label': `time partitioned by ${node.schema.partition.join(', ')}`, style: { cursor: 'help' }
          }, '🗓️▤'),
          h('span', { title: node.kind, style: { color: '#64748b', fontSize: '.75em' } }, node.kind))
        const metaRow = () => h('div', { style: {
          display: 'flex', justifyContent: 'space-between', padding: '.35em .7em',
          color: '#94a3b8', borderBottom: '1px solid #1e293b', fontSize: '.82em'
        }}, h('span', {}, `▥ ${node.meta.fields}`), h('span', {}, `◫ ${size}`),
          h('span', {}, `≡ ${rows} · ${node.meta.rowGroups} RG`))
        const relation = () => h('div', {
          title: 'key symbols determine the value', style: {
            padding: '.35em .7em', color: '#fbbf24', borderBottom: '1px solid #1e293b', textAlign: 'center'
          }
        }, ...node.relation.map((part, i) => {
          const [symbol, fields] = Array.isArray(part) ? part : [part]
          const title = [symbolNames[symbol], fields].filter(Boolean).join(' — ')
          return h('span', { key: i, title, 'aria-label': title, style: { cursor: title ? 'help' : 'inherit' } }, symbol + ' ')
        }))
        const primitiveData = () => h('div', { title: 'primitive data', style: {
          opacity: 'var(--columns)', maxHeight: 'calc(var(--columns) * 12em)', overflow: 'hidden',
          padding: '0 .7em', color: '#94a3b8', borderBottom: '1px solid #1e293b', transition: 'opacity .3s'
        }}, h('div', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          node.schema.primitiveData.join(' · ')),
          h('div', { title: 'real row', style: {
            opacity: 'var(--moreFields)', maxHeight: 'calc(var(--moreFields) * 8em)', overflow: 'hidden', color: '#a7f3d0'
          } },
            Object.entries(node.schema.primitiveExample).map(([field, value]) => `${field}=${value ?? 'null'}`).join(' · ')))
        const groupTiles = () => h('div', { style: {
          display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '.45em', padding: '.6em'
        }}, ...groups.map(group => h('div', {
          title: group.inferred ? 'LLM inference: grouping based on source field names' : 'Physical source or cube-derived grouping',
          style: {
            minWidth: 0, padding: '.45em .55em', border: '1px solid #334155', borderRadius: '.45em',
            background: '#101a2c', fontStyle: group.inferred ? 'italic' : 'normal'
          }
        }, h('div', { style: { color: '#7dd3fc', fontWeight: 700 } },
          `${group.name}${group.inferred ? ' · LLM inference' : ''}`),
        h('div', { style: { color: '#94a3b8', marginTop: '.25em' } },
          `${group.fields.length} fields · ${group.fields.slice(0, 3).map(field => field.name).join(', ')}`))))
        const fieldGrid = () => h('div', { style: {
          display: 'grid', gridTemplateColumns: 'minmax(8em,.8fr) 7em minmax(18em,2fr)',
          alignItems: 'start', columnGap: '.8em', padding: '.55em .7em'
        }}, ...groups.flatMap(group => [
          h('div', {
            title: group.inferred ? 'LLM inference: grouping based on source field names' : 'Physical source or cube-derived grouping',
            style: {
              gridColumn: '1 / -1', marginTop: '.45em', padding: '.3em 0', color: '#7dd3fc',
              borderBottom: '1px solid #334155', fontWeight: 700, fontStyle: group.inferred ? 'italic' : 'normal'
            }
          }, group.name, group.inferred && ' · LLM inference'),
          ...group.fields.flatMap(field => {
            const detail = field.fact
              ? `${field.fact[0]} · ${field.fact[1]}${field.fact[2] ? ' · LLM inference' : ''}`
              : ''
            const style = { padding: '.28em 0', borderBottom: '1px solid #1e293b', minWidth: 0 }
            return [
              h('div', { style: { ...style, fontWeight: 650 } }, field.name),
              h('div', { style: { ...style, color: '#94a3b8' } }, field.type),
              h('div', {
                title: field.fact?.[2] ? 'LLM inference' : detail && 'Derived from cube and benchmark code',
                style: { ...style, color: detail ? '#fbbf24' : '#475569', fontStyle: field.fact?.[2] ? 'italic' : 'normal' }
              }, detail || '—', field.profile && h('div', { style: { color: '#a7f3d0', marginTop: '.2em' } }, field.profile))
            ]
          })
        ]))
        const renderTable = (itemCtx, view) => h('div', {
          xmlns: 'http://www.w3.org/1999/xhtml', 'data-zui-card': itemCtx.data.id,
          style: {
            height: '100%', overflow: 'hidden', border: '1px solid #334155', borderRadius: '.55em',
            background: '#0b1220', color: '#cbd5e1', fontSize, cursor: 'inherit', userSelect: 'text'
          }
        }, header(), relation(), primitiveData(), metaRow(), view === 'groups' ? groupTiles() : view === 'details' ? fieldGrid() : null)
        let viewIdx = tableZoomViews.activeView(node.width * zctx.vars.zoomState.scale)
        if (viewIdx === 2 && hotCard !== node.id) viewIdx = 1
        const card = tableZoomViews.views[viewIdx].hFunc(zctx.setData(node).setVars({ renderTable }))
        const fieldCount = groups.reduce((count, group) => count + group.fields.length, 0)
        const detailsHeight = viewIdx === 2 ? Math.max(node.height, (75 + fieldCount * 15 + groups.length * 20)
          / zctx.vars.zoomState.scale) : node.height
        return h('g', { transform: `translate(${node.x},${node.y})`, opacity: on ? 1 : .16 },
          h('foreignObject', { width: node.width, height: detailsHeight }, card))
      }))
        }
      })
      return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0 } }, h('div:slides', {},
        h('section', { 'data-background-color': '#071521', style: { height: '100%', top: 0 } },
          h('h2', { style: {
            position: 'absolute', top: 0, left: 0, right: 0, margin: 0, fontSize: '.42em', lineHeight: 1
          } }, 'KPIs SQL'),
          h('div', { style: {
            position: 'absolute', top: 19, left: 0, right: 0, height: 13, lineHeight: 1,
            fontSize: '.25em', color: '#94a3b8'
          } }, 'four business measures → one dependency-pruned query'),
          h('div', { style: { position: 'absolute', inset: '34px 0 0' } }, hh(ctx, kpisSqlZui))),
        h('section', { 'data-background-color': '#071521', style: { height: '100%', top: 0 } },
          h('h2', { style: {
            position: 'absolute', top: 0, left: 0, right: 0, margin: 0, fontSize: '.42em', lineHeight: 1
          } }, 'KPI query activates this subgraph'),
          h('div', { style: {
            position: 'absolute', top: 19, left: 0, right: 0, height: 13, lineHeight: 1,
            fontSize: '.25em', color: '#94a3b8'
          } },
            'sales + profit + coverage · 30 days'),
          h('div', { style: { position: 'absolute', inset: '34px 0 18px' } }, h(Erd, { dynamic: true })),
          h('div', { style: { position: 'absolute', right: 10, bottom: 2, fontSize: '.38em', color: '#fbbf24' } },
            '● Store + Prt are active because they are marked always')),
        h('section', { 'data-background-color': '#071521', style: { height: '100%', top: 0 } },
          h('h2', { style: { position: 'absolute', top: 0, left: 0, right: 0, margin: 0 } }, 'Comax sales star'),
          h('div', { style: { position: 'absolute', inset: '48px 0 0' } }, h(Erd, { dynamic: false }))),
        h('section', { 'data-background-color': '#020617', style: { height: '100%', top: 0, textAlign: 'left' } },
          hh(ctx, comaxBenchmarkApplet))))
    }
    }
  )
})

ReactComp('comax2Applet', { impl: dsls.react['react-comp'].comaxInternals() })
