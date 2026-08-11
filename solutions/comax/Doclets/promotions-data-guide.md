# Comax Promotions — Data Guide (tenant OEM_BI_4466)

Operating manual for querying **promotions**. Everything is DuckDB over parquet served from the local room.
Path helper used below: `R = signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466`. Query with `read_parquet('R/<Table>.parquet')`.

---

## 1. The promotion tables

| table | grain | key | what it is |
|---|---|---|---|
| **Mivza** | one row per promo | `C` | the master — name, dates, mechanism, terms, targeting |
| **Mivza_Svg** | one row per campaign | `C` | 73 campaign vehicles (פלייר/flyer, קו קופה/checkout, מועדון/club, monthly) |
| **Mivza_Prt** | promo × item | (`MivzaC`,`PrtC`) | bridge: which items each promo covers |
| **promotion_cycles** | one row per promo | `mivza_c` | **recurrence key** — maps each promo to the logical *deal* it re-issues (see §5) |
| **KupaDoc_Lines** | one row per sold line | `C` | sales fact — carries `MivzaNo` (the promo on that line) |
| **KupaDoc_Header** | one row per receipt | `C` | receipt date/store (`DateDoc`,`StoreC`) |
| **DailyPriceCost** | item×store×day | — | cost snapshot (`FinalRegularCostPrice`) |
| **Prt** | one row per item | `C` | item master (`Nm`,`DepartmentC`,`Spk`) |

### Mivza (master) — key columns
`C` (promo id) · `Nm` (name, e.g. *"חיתולי האגיס פרידום 3 ב-110 שח"*) · `FromDate`/`ToDate` (planned window) · `MivzaType`/`MivzaTypeNm` (mechanism) · `Cmt` (qty threshold) · `Scm` (target ₪) · `K_AczDis` (disc %) · `K_ScmDis` (disc ₪) · `MinCmt` (min qty) · `CustomerGroupList` (targeted segments) · `SivugC` (→ `Mivza_Svg.C`, campaign) · `Kod` (business code — **per-promo, does NOT group re-issues**).

---

## 2. Keys & joins

```
KupaDoc_Lines.MivzaNo  = Mivza.C            -- the promo applied to a sold line (0 = no promo)
KupaDoc_Lines.KupaDocC = KupaDoc_Header.C   -- line → receipt (for the date)
KupaDoc_Lines.PrtC     = Prt.C              -- line → item
Mivza_Prt (MivzaC,PrtC)                     -- promo → its items
Mivza.SivugC           = Mivza_Svg.C        -- promo → campaign (only ~14% tagged)
promotion_cycles.mivza_c = Mivza.C          -- promo → logical recurring deal
DailyPriceCost (ItemID,StoreID) latest FinalRegularCostPrice  -- item cost (arg_max by DateDoc)
```

---

## 3. Non-negotiable facts (get these wrong and every number is wrong)

1. **Money is gross.** `Scm`, `MhrLine` include VAT. **Net = `Scm - VatAmount`.**
2. **Line cost is empty.** `ScmAlut = 0`. Cost only from `DailyPriceCost` via the latest-cost CTE:
   ```sql
   ic AS (SELECT StoreID, ItemID, arg_max(FinalRegularCostPrice, DateDoc) AS unit_cost
          FROM read_parquet('R/DailyPriceCost.parquet') WHERE FinalRegularCostPrice > 0 GROUP BY 1,2)
   ```
   `DailyPriceCost.DateDoc` is BIGINT `yyyymmdd`; to match a sale date use `year(h.DateDoc)*10000+month(h.DateDoc)*100+day(h.DateDoc)`.
3. **Window to 2024+.** Item-level lines are complete only from `2024-01-01`. Always filter `h.DateDoc >= DATE '2024-01-01'`.
4. **`MivzaNo = 0` means no promo.** Non-promo sales are the baseline for lift.
5. **Returns are negative `Cmt`/`Scm`.** Summing nets them out (do not filter by DocType).
6. **Per-line `AczDisLine` LIES for buy-get-free deals.** The paid units read `0%`; the free unit is a **separate line at `AczDisLine = 100`** (net 0). Also carries a `-99900` null sentinel — never sum it.
   → **Always measure discount as `eff_discount = 1 - sum(Scm)/sum(MhrLine*Cmt)` at promo/deal grain**, not from the line %.
7. **Free units cost money.** Lines with `AczDisLine = 100` have net 0 but real COGS — include their cost in margin or a BOGO looks free when it's a loss.
8. **`Cmt` mixes units and kg** (weighed produce). Fine to sum within a promo; don't compare across item types.

**Coverage:** 20,706 promos in the master; **15,618 ever sold (100% of sold promos have master rows)**; 5,088 never sold (planned/flops); 353 have no items (basket-level: coupons, free delivery, end-of-bill — analyze at receipt grain).

---

## 4. Mechanism taxonomy (`MivzaType` / `MivzaTypeNm`)

Read the mechanism from the type + its parameters (`Cmt`,`Scm`,`K_AczDis`). Do **not** infer it from the lines.

| type | MivzaTypeNm | meaning | params | count |
|---|---|---|---|---|
| 1 | כמות בסכום | `Cmt` units for `Scm` ₪ ("3 for 110"); `Cmt=1` = plain price point | `Cmt`,`Scm` | 20,537 |
| 6 | קנה בכמות הוסף קבל | buy `Cmt`, added unit at `K_AczDis`% off (100 = free) → **BOGO/N+M** | `Cmt`,`K_AczDis` | 81 |
| 9 | שני בחצי מחיר | second unit at half price | — | 36 |
| 17 | שני בהנחה (הזול מביניהם) | cheaper second unit at `K_AczDis`% | `K_AczDis` | 18 |
| 5 | קנה בסכום הוסף קבל | spend `Scm`, get an added item | `Scm` | 14 |
| 19 | קופון מעל סכום | coupon above `Scm` ₪ | `Scm` | 6 |
| 23 | חבילה | fixed package | `Scm` | 5 |
| 18 | הנחת סוף חשבון | `K_AczDis`% off the whole basket | `K_AczDis` | 5 |
| 13 | קנה בכמות קבל מתנה | buy `Cmt`, get a gift | `Cmt` | 2 |
| 14 | קנה בסכום קבל מתנה | spend `Scm`, get a gift | `Scm` | 1 |
| 28 | קופון מעל כמות | coupon above `Cmt` units | `Cmt` | 1 |

---

## 5. The recurrence problem → `promotion_cycles`

**The ERP mints a NEW promo `C` every cycle** — the diaper deal ran under 30+ different `C`s over 3 years, each with its own name, dates, and rotating terms (3-for-110 → 2-for-76 → 3-for-90). **Nothing in the raw data groups them** — not `Kod`, not `SivugC`, not the master. So *any* "vs last time / did it lift / how is this deal trending" question first needs to know **which promos are the same deal**.

`promotion_cycles` is that map, built **once**:

| column | meaning |
|---|---|
| `mivza_c` | the promo id (= `Mivza.C`) |
| `deal_id` | canonical id shared by all re-issues of one recurring deal |
| `deal_name` | clean human label (e.g. *"חיתולי האגיס פרידום דריי"*) |
| `deal_category` | e.g. *חיתולים* |
| `confidence` | grouping confidence |
| `method` | `name_stem` / `item_set` / `llm` |

**How it's built (one-time):** (a) normalize `Mivza.Nm` — strip the terms tail (`regexp_replace(Nm,'[0-9].*$','')`), strip campaign prefixes (פלאייר/קבוע/מבצע) and branch tags, fold typos (פרידום≈פרידיום); (b) cross-check item-set overlap via `Mivza_Prt` (Jaccard) to merge name variants and validate; (c) an LLM adjudicates the ambiguous boundaries (is a pack-size change the same deal? a branch-only variant?) and assigns the clean `deal_name`/`deal_category`. The name is the retailer's own label — the item-set is the objective anchor.

**Until `promotion_cycles` exists**, group cycles inline by normalized name-stem (fallback, see R2).

---

## 6. Recipes — the four questions

`m = Mivza`, `l = KupaDoc_Lines`, `h = KupaDoc_Header`, `pc = promotion_cycles`.

### R1 — Units sold (per promo)
```sql
SELECT l.MivzaNo, any_value(m.Nm) nm, round(sum(l.Cmt)) units
FROM read_parquet('R/KupaDoc_Lines.parquet') l
JOIN read_parquet('R/Mivza.parquet') m ON l.MivzaNo = m.C
JOIN read_parquet('R/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C
WHERE l.MivzaNo <> 0 AND l.Cmt > 0 AND h.DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY units DESC;
```

### R2 — Comparison to past cycles of the same deal
```sql
SELECT pc.deal_name, m.C promo, m.FromDate::date, (m.Cmt||'→'||m.Scm) plan_terms,
       round(sum(l.Cmt)) units,
       round(100*(1 - sum(l.Scm)/nullif(sum(l.MhrLine*l.Cmt),0)),1) eff_disc,
       round(sum(l.Scm-l.VatAmount)) net
FROM read_parquet('R/promotion_cycles.parquet') pc
JOIN read_parquet('R/Mivza.parquet') m ON m.C = pc.mivza_c
JOIN read_parquet('R/KupaDoc_Lines.parquet') l ON l.MivzaNo = m.C
JOIN read_parquet('R/KupaDoc_Header.parquet') h ON h.C = l.KupaDocC
WHERE pc.deal_name = 'חיתולי האגיס פרידום דריי' AND l.Cmt>0 AND h.DateDoc >= DATE '2024-01-01'
GROUP BY 1,2,3,4 ORDER BY m.FromDate;
```
**Fallback without `promotion_cycles`:** replace the `pc` join with `WHERE (m.Nm LIKE '%פרידום%' OR m.Nm LIKE '%פרידיום%')`.

### R3 — Incremental lift (promo vs baseline)
```sql
WITH items AS (SELECT DISTINCT PrtC FROM read_parquet('R/Mivza_Prt.parquet')
               WHERE MivzaC IN (SELECT mivza_c FROM read_parquet('R/promotion_cycles.parquet')
                                WHERE deal_name = 'חיתולי האגיס פרידום דריי')),
     ic AS (SELECT ItemID, arg_max(FinalRegularCostPrice,DateDoc) uc
            FROM read_parquet('R/DailyPriceCost.parquet') WHERE FinalRegularCostPrice>0 GROUP BY 1)
SELECT CASE WHEN l.MivzaNo<>0 THEN 'on_promo' ELSE 'baseline' END period,
       round(sum(l.Cmt)/count(DISTINCT h.DateDoc),1) units_per_day,
       round(100*(sum(l.Scm-l.VatAmount)-sum(l.Cmt*coalesce(ic.uc,0)))/nullif(sum(l.Scm-l.VatAmount),0),1) margin_pct
FROM read_parquet('R/KupaDoc_Lines.parquet') l
JOIN read_parquet('R/KupaDoc_Header.parquet') h ON l.KupaDocC=h.C
JOIN items ON l.PrtC=items.PrtC LEFT JOIN ic ON l.PrtC=ic.ItemID
WHERE l.Cmt>0 AND h.DateDoc >= DATE '2024-01-01' GROUP BY 1;
```
Lift = `on_promo.units_per_day / baseline.units_per_day`. (Baseline is interspersed days; for a stricter read compare pre/post windows around `m.FromDate`.)

### R4 — Profitability (+ plan vs actual)
```sql
WITH ic AS (SELECT ItemID, arg_max(FinalRegularCostPrice,DateDoc) uc
            FROM read_parquet('R/DailyPriceCost.parquet') WHERE FinalRegularCostPrice>0 GROUP BY 1)
SELECT l.MivzaNo, any_value(m.MivzaTypeNm) mech, any_value(m.Cmt||'→'||m.Scm) planned,
       round(100*(1-sum(l.Scm)/nullif(sum(l.MhrLine*l.Cmt),0)),1) realized_disc,
       round(sum(l.Scm-l.VatAmount)) net,
       round(100*(sum(l.Scm-l.VatAmount)-sum(l.Cmt*coalesce(ic.uc,0)))/nullif(sum(l.Scm-l.VatAmount),0),1) margin_pct
FROM read_parquet('R/KupaDoc_Lines.parquet') l
JOIN read_parquet('R/Mivza.parquet') m ON m.C = l.MivzaNo
JOIN read_parquet('R/KupaDoc_Header.parquet') h ON h.C = l.KupaDocC
LEFT JOIN ic ON ic.ItemID = l.PrtC
WHERE l.MivzaNo <> 0 AND l.Cmt>0 AND h.DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY margin_pct;
```
For **buy-get-free** deals (type 6/13), add `free_units = sum(Cmt) FILTER (WHERE AczDisLine=100)` — their COGS is the giveaway cost.

### R5 — By campaign (Mivza_Svg)
Join `m.SivugC = sv.C` and group by `sv.Nm` (only ~14% of promos are campaign-tagged — state the covered share).

### R6 — By mechanism
Group any of the above by `m.MivzaTypeNm` to compare BOGO vs price-point vs second-half-price.

---

## 7. Answer hygiene
- Report net (ex-VAT), state the 2024+ window, and always show a **costed-share** caveat (cost join covers ~94–97%; missing cost understates COGS).
- Discounts: use `eff_discount`, never the line `%`.
- Deal-level questions: attribute via `promotion_cycles`; if you fall back to name-matching, say so — it is fuzzy.
