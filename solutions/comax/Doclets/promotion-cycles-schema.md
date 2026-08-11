# `promotion_cycles` — schema & contract (FROZEN)

The **shape below is stable** — build against it now. An LLM pass is still refining the *values* of
`deal_id` / `deal_name` / `brand` / `category` (better grouping + canonical names), but **columns, types,
keys, and grain will not change**. `mivza_c` and all join keys are already final.

Tenant: `OEM_BI_4466` (the supermarket). All data is local parquet read via `read_parquet`.

---

## Table: `promotion_cycles`
Maps every promo (`mivza_c`) to the recurring **deal** it belongs to, so any promo can find its past/sibling cycles.

- **Parquet (what the llm-flow duckDbSql step reads):** `signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466/promotion_cycles.parquet`
- **DuckDB catalog:** `big.promotion_cycles`
- **Grain:** exactly one row per promo id. Every `Mivza.C` appears once.

| column | type | semantics | guarantee |
|---|---|---|---|
| `mivza_c` | BIGINT | the promo id (a single promotion instance / "cycle") | PK, unique, final |
| `deal_id` | BIGINT | recurring-deal key — **all cycles of the same deal share it**; equals the smallest `mivza_c` in the deal | stable id |
| `deal_name` | VARCHAR | canonical Hebrew deal name (brand + product; price/qty/branch/campaign noise removed) | being LLM-refined |
| `brand` | VARCHAR | brand, nullable (e.g. `האגיס`, `יכין`, `ברילה`) | being LLM-refined |
| `category` | VARCHAR | product category (e.g. `חיתולים`, `רסק עגבניות`) | being LLM-refined |
| `n_cycles` | BIGINT | number of cycles (promos) in this deal = `count(*) over deal_id` | derived |
| `is_recurring` | BOOLEAN | `n_cycles >= 2` | derived |

**Use `deal_id` as the deal key** (stable). `deal_name`/`brand`/`category` are labels — display them, don't join on them.

---

## Join map (how `promotion_cycles` connects to everything)

`promotion_cycles.mivza_c` = `Mivza.C` = `Mivza_Prt.MivzaC` = `KupaDoc_Lines.MivzaNo`

| table (`…/OEM_BI_4466/<T>.parquet`) | key cols you need | gives you |
|---|---|---|
| `Mivza` | `C`, `Nm`, `FromDate`, `ToDate`, `MivzaTypeNm`, `Cmt`, `Scm`, `K_AczDis`, `MinCmt`, `CustomerGroupList`, `SivugC` | promo name, **planned window**, **mechanism**, terms, targeting, campaign link |
| `Mivza_Svg` | `C`, `Nm` | campaign name (join `Mivza.SivugC = Mivza_Svg.C`; only ~14% tagged) |
| `Mivza_Prt` | `MivzaC`, `PrtC` | the promo's **items** (`PrtC → Prt.C`) |
| `KupaDoc_Lines` | `KupaDocC`, `PrtC`, `MivzaNo`, `Cmt`, `Scm`, `VatAmount`, `MhrLine`, `AczDisLine` | **actual sales** (one row per sold SKU line) |
| `KupaDoc_Header` | `C`, `StoreC`, `DateDoc`, `MOADON_NO` | receipt date/store (join `Lines.KupaDocC = Header.C`) |
| `DailyPriceCost` | `ItemID`, `StoreID`, `DateDoc` (BIGINT yyyymmdd), `FinalRegularCostPrice` | **cost** for margin |
| `Prt` | `C`, `Nm`, `DepartmentC`, `Spk` | item master (dept `→Departments`, supplier `→Suppliers`) |

---

## Non-negotiable facts (or your numbers are wrong)
1. **Net** = `Scm - VatAmount`. `Scm` and `MhrLine` are **gross (incl. VAT)**.
2. **Window sales to `Header.DateDoc >= DATE '2024-01-01'`** — line detail is incomplete before 2024.
3. **Cost**: latest `FinalRegularCostPrice` per item, `arg_max(FinalRegularCostPrice, DateDoc)` (or as-of the sale date). Coverage ~94–97%; missing cost ⇒ don't silently treat as 0 in margin.
4. **Effective discount** (trust this, not the per-line field): `eff_discount = 1 - sum(Scm)/sum(MhrLine*Cmt)`.
5. **`AczDisLine` lies for buy-get-free deals**: the free unit is a separate line at `AczDisLine = 100` (net 0, real COGS); paid lines read 0%. Free units = `sum(Cmt) where AczDisLine >= 100`.
6. **Returns** = negative `Cmt`/`Scm` lines (summing nets them). Filter `Cmt > 0` for gross demand.
7. **No promo dates in sales** — use `Mivza.FromDate/ToDate` for *plan*, `min/max(Header.DateDoc)` for *actuals*; they can differ.
8. **`mivza_c` = one cycle; `deal_id` = the recurring deal.** "Compare to past" / "lift over time" ⇒ group by `deal_id`.

---

## Ready-to-use query patterns (room paths abbreviated as `…/<T>.parquet`)

**Past cycles of whatever deal a promo belongs to**
```sql
WITH pc AS (SELECT * FROM read_parquet('…/promotion_cycles.parquet')),
     m  AS (SELECT * FROM read_parquet('…/Mivza.parquet'))
SELECT pc.mivza_c, m.FromDate::date, m.MivzaTypeNm, m.Cmt||'→'||m.Scm AS terms
FROM pc JOIN m ON pc.mivza_c = m.C
WHERE pc.deal_id = (SELECT deal_id FROM pc WHERE mivza_c = :promo)
ORDER BY m.FromDate;
```

**Units / net / margin per cycle, then compare across the deal**
```sql
WITH pc AS (SELECT * FROM read_parquet('…/promotion_cycles.parquet')),
     l  AS (SELECT * FROM read_parquet('…/KupaDoc_Lines.parquet')),
     h  AS (SELECT * FROM read_parquet('…/KupaDoc_Header.parquet')),
     ic AS (SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) AS cost
            FROM read_parquet('…/DailyPriceCost.parquet') GROUP BY ItemID)
SELECT pc.deal_id, l.MivzaNo AS cycle, round(sum(l.Cmt)) units,
       round(100*(1 - sum(l.Scm)/nullif(sum(l.MhrLine*l.Cmt),0)),1) eff_discount,
       round(sum(l.Scm - l.VatAmount)) net,
       round(100*(sum(l.Scm-l.VatAmount) - sum(l.Cmt*coalesce(ic.cost,0)))/nullif(sum(l.Scm-l.VatAmount),0),1) margin_pct
FROM l JOIN h ON l.KupaDocC = h.C
       JOIN pc ON pc.mivza_c = l.MivzaNo
       LEFT JOIN ic ON ic.ItemID = l.PrtC
WHERE l.Cmt > 0 AND h.DateDoc >= DATE '2024-01-01'
GROUP BY pc.deal_id, l.MivzaNo ORDER BY cycle;
```

**Incremental lift** — a deal's items on-promo vs off-promo: join `Mivza_Prt` (items of any cycle of the deal) to `KupaDoc_Lines`, split by `MivzaNo <> 0`, compare `units/day` and `margin_pct`.

**Profitability by mechanism / campaign** — group the per-cycle result by `Mivza.MivzaTypeNm` or by `Mivza_Svg.Nm` (via `Mivza.SivugC`).
