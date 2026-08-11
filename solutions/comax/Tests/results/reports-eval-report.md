# Comax reports-based analytics LLM-flow — BI evaluation report

Workflow: **reportsAnalytics** (gemini-3.5-flash main, catalog of 10 pre-validated reports) on the 50 verified retail-manager questions (ground truth: verified-questions.md). Judge: openai/gpt-5.4.
Weights: accuracy 0.4 / method 0.15 / selection 0.15 / honesty 0.2 / presentation 0.1.
selection is deterministic: 1 when a report the flow ran (runReport log ∪ reportsUsed echo) covers the question per the catalog questionsCovered.
Baseline: **basicAnalytics** from eval-rows.json (its totals use its own weights acc .45 / method .25 / honesty .2 / pres .1, no selection).

## Overall — vs basicAnalytics baseline
| metric | reportsAnalytics | basicAnalytics |
|---|---|---|
| **total** | 68% | 26% |
| accuracy | 62% | 26% |
| method | 61% | 23% (raw-SQL method) |
| selection | 100% | — |
| honesty | 63% | 26% |
| presentation | 65% | 34% |
| flow errors | 0/50 | 15/50 |
| avg duration | 13.6s | 143.0s |
| avg tokens in/out | 19146/0 | 4074567/0 |

## By category — vs baseline
| category | n | total | base total | Δ | accuracy | selection | honesty | flow errors | base flow errors |
|---|---|---|---|---|---|---|---|---|---|
| מכירות | 8 | 67% | 7% | +60pp | 61% | 100% | 59% | 0 | 5 |
| רווחיות | 7 | 82% | 27% | +55pp | 78% | 100% | 80% | 0 | 4 |
| מלאי | 8 | 71% | 35% | +35pp | 65% | 100% | 68% | 0 | 2 |
| מבצעים | 6 | 55% | 23% | +32pp | 47% | 100% | 47% | 0 | 0 |
| לקוחות | 5 | 66% | 22% | +44pp | 59% | 100% | 62% | 0 | 1 |
| ספקים | 5 | 84% | 41% | +43pp | 82% | 100% | 83% | 0 | 0 |
| תמהיל | 5 | 55% | 20% | +35pp | 46% | 100% | 45% | 0 | 2 |
| תפעול | 6 | 64% | 37% | +28pp | 58% | 100% | 58% | 0 | 1 |

## Per question
| id | label | status | acc | method | sel | honesty | pres | total | Δ base | dur | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q1 | מכירות יומיות | VERIFIED | 100% | 100% | 100% | 100% | 95% | 100% | +79pp | 9s |  All numbers match verified facts exactly (₪556K vs ₪590K, -5.8%, 3 branches only, correct weekday anchor 06-27 vs 06-20). Period disclosed. Minor: 'narrative' field shows ₪0 (likely template artifact), but main text is correct and clear. |
| Q2 | דירוג סניפים | VERIFIED | 35% | 40% | 100% | 50% | 60% | 51% | +51pp | 10s |  Assistant's numbers (₪6.85M, ₪5.13M leaders) diverge sharply from verified truth (₪8.12M, ₪6.34M). Weakest branch ranking inverted: assistant shows ₪340K as weakest, but verified shows ₪0.35M (same store, different scale). Data period undisclosed in main answer; narrative claims ₪6.85M without period anchor. MoM basket trends invented (no MoM data provided). Report choice reasonable but numbers fundamentally misaligned. |
| Q3 | גודל סל | VERIFIED | 95% | 92% | 100% | 88% | 90% | 93% | +93pp | 10s |  Numbers match verified facts (גני תקווה ₪118, כץ -3%, כפר סבא -3.4%, רחובות -2%). Report choice (branch-performance ranking) fits. Minor: kalnit-or-yehuda is new/micro (21 receipts) — should flag as unreliable baseline. Period anchor not explicitly stated (assumed May vs Apr 2026). Presentation clear, Hebrew-native. |
| Q4 | מספר עסקאות | VERIFIED | 20% | 30% | 100% | 10% | 40% | 34% | +23pp | 10s |  Assistant invents transaction counts (5516 total, 2216 etc.) and trend direction (claims DOWN -5.8%) contradicting verified facts (UP +0.5% to +3.2%). No raw numbers match. Fabricates revenue figures (556K₪/590K₪) not in ground truth. Claims 4 branches; only 3 exist on 06-27. Misrepresents report method. |
| Q5 | שעות שיא | VERIFIED | 20% | 10% | 100% | 30% | 40% | 35% | +9pp | 14s |  Assistant answered NETWORK-WIDE hours (12h: 74.6k tx) instead of PER-BRANCH peaks. Ground truth requires branch-level archetypes (EVENING vs MIDDAY). No branch names, no staffing fit judgment. Fabricated basket-size analysis without per-branch data. Wrong report section. |
| Q6 | מגמת מכירות | VERIFIED | 25% | 15% | 100% | 20% | 30% | 34% | +34pp | 14s |  Assistant fabricates monthly aggregations and promo % splits not in data; ignores verified 12-week window (2026-03-30 to 2026-06-21); includes partial week 06-22; contradicts ground truth (FLAT, not -7% decline); wrong analytical framing. |
| Q7 | צמיחת חנויות זהות | VERIFIED | 95% | 92% | 100% | 88% | 90% | 93% | +93pp | 12s |  Correct same-store +12.3% YoY, proper 9-branch filter, net-based (VAT-neutral). Receipt growth (+8%) insight valid but not in ground truth—minor addition. Caveats stated but could emphasize 'Jan 1–Jun 27 both years' more explicitly. |
| Q8 | סוף שבוע מול חול | VERIFIED | 95% | 92% | 100% | 88% | 94% | 94% | +94pp | 17s |  Numbers match verified facts (31.3% vs 31.2%, Friday 22.6%, Saturday 8.6%). Correctly identifies Friday as the driver and Saturday as weak. Minor: doesn't explicitly state the analysis period (implied annual from rows). Caveat about 3-branch Saturday limitation is present but could be more prominent in the staffing recommendation. |
| Q9 | רווח גולמי | VERIFIED | 72% | 65% | 100% | 80% | 75% | 77% | +77pp | 11s |  גני תקווה ₪68.7M vs verified ₪71.6M (−4.0%); בר כוכבא drag −₪2.57M matches verified −₪2.6M. Margin% 32.4% vs 32.6% acceptable. Chain avg not disclosed (31.9% in truth). Report fit is correct but costed_share anomaly (רמת השרון 100.4%) suggests data issue. Caveats stated but chain-avg context missing. |
| Q10 | מרווח קטגוריה | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +93pp | 13s |  Numbers match verified facts (פירות וירקות ₪54.1M, 41.8%, חלב ₪34.5M, 26.1%). Correctly identifies profit engines vs. traffic drivers (משקאות חמים 13% margin). Minor: 'receipts_touched' used instead of 'baskets' (distinct store,day,cust); assistant didn't disclose this proxy swap. Period not stated (assumed 2024 YTD per reference). Presentation clear, Hebrew-native, actionable. |
| Q11 | מוצרי הפסד | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +93pp | 12s |  Numbers match verified facts (₪580K loss, 25 items, coffee/bags as intentional loss-leaders, berries as spoilage). Minor: narrative field incomplete; honesty: didn't explicitly state 2024+ window or note cost-NULL exclusion. |
| Q12 | דליפת מרווח | VERIFIED | 92% | 88% | 100% | 85% | 90% | 91% | +59pp | 14s |  Numbers align with verified ₪39.4M chain leak (assistant shows ₪3.6M top-15 subset). Promo/manual split correct. Minor: assistant omits explicit 2024 period anchor and doesn't state full ₪39.4M context; rows are valid sample, not exhaustive. Presentation clear, caveats present but could emphasize data is legitimate promo-driven, not control failure. |
| Q13 | סחיפת עלות | PARTIAL | 45% | 35% | 100% | 60% | 50% | 55% | +55pp | 14s |  Assistant lists 4 items; verified ground truth identifies only 2 strict matches (דנוור סטייק, hot-drink cups). Row data shows cost_chg_pct but includes items with cost <10% (rice 8.3%, burger 10.6%), violating strict 15% bar. Price direction errors: דנוור shows −7.6% (not −7.5%), cups −19.4% (matches). Missing supplier context for strict matches. Caveats stated (2025 baseline only) but threshold relaxation undisclosed. Report choice 'pricing-cost-drift' is sensible; full_data slice logic (cost>0, price≤0) is reasonable but overshoots verified strict criteria. |
| Q14 | רווח פריט | VERIFIED | 95% | 98% | 100% | 92% | 96% | 96% | +3pp | 21s |  Numbers match verified ground truth (tomatoes ₪4.3M, cherry ₪4.1M, cucumbers ₪2.4M, bananas ₪1.6M). Correctly excludes cost-NULL items. Minor: list shows 15 rows instead of claimed 20; margin% rounding acceptable. Clear Hebrew business framing, absolute ₪ focus correct. |
| Q15 | פריטים ללא מרווח | VERIFIED | 58% | 72% | 100% | 65% | 80% | 70% | +4pp | 13s |  Assistant reports ₪3.8M vs verified ₪9.2M (59% undercount). Correct items/ranking but wrong total. Method sound; honesty weak on magnitude gap; presentation clear Hebrew. |
| Q16 | מלאי שלילי | VERIFIED | 25% | 30% | 100% | 40% | 50% | 43% | +8pp | 13s |  Assistant fabricated monetary loss values (₪308K for 'Agami bread') and item rankings with no cost data in ground truth. Conflated unit negatives with financial impact. Ignored artifact/suspicious split clarity. No disclosure of cost-data absence. |
| Q17 | עודף מלאי | VERIFIED | 95% | 92% | 100% | 88% | 90% | 93% | +57pp | 13s |  Numbers match verified facts (MUTTI ₪677K, Angus kits, strawberries top list). Report choice correct. Minor: no explicit period disclosure (60-day window assumed current); strawberry count caveat missing. |
| Q18 | חוסרים | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +93pp | 11s |  Numbers match verified facts (cottage 0.27d, watermelon 0.8d, onions 0.73d). Report selection correct. Minor: narrative says '1 day' for watermelon (should be 0.8d); no period disclosure stated explicitly. |
| Q19 | פחת | PARTIAL | 20% | 15% | 100% | 30% | 25% | 34% | -29pp | 15s |  Assistant fabricated ₪1.2M and ₪308K numbers absent from verified ₪4.27M proxy. Rows invented; no report catalog exists. Ignored receiving-gap caveat. |
| Q20 | מלאי מת | VERIFIED | 75% | 65% | 100% | 55% | 70% | 73% | +73pp | 15s |  Assistant conflates two separate populations: (1) real discontinued items (135 items, ₪3,799 max, seasonal perishables Nov-2025–Feb-2026) vs. (2) stale-sale items (no ArchiveDate). Ground truth confirms 135 discontinued with inventory exist; assistant's narrative focuses on figs/grapes/pineapple/chestnuts/strawberries (correct seasonal list) but rows show unarchived items (תאנים, אננס, ענבים, תות, ערמונים). Cost coverage ~20% on archived items acknowledged in truth but not in answer. Numbers are low-value (₪1,257 top item vs. claimed ₪866k) — major discrepancy. Report choice (inventory-health dead-stock) is reasonable but rows don't filter ArchiveDate NOT NULL explicitly. Honesty gap: no disclosure that cost is lower-bound or that placeholder stubs were excluded. |
| Q21 | תזמון הזמנה | VERIFIED | 92% | 88% | 100% | 95% | 90% | 93% | +36pp | 13s |  Numbers align with 7-day reorder logic; perishables dominate correctly. Caveats stated (flat rate, no promo/pack MOQ). Minor: narrative says '1 day' but data shows 0.8 days—rounding variance acceptable. |
| Q22 | שווי מלאי | VERIFIED | 92% | 88% | 100% | 85% | 90% | 91% | +19pp | 11s |  Numbers match verified facts (₪18.8M vs ₪19.7M = 4.6% gap within tolerance). Top 3 branches correct. Method uses right report. Caveats stated but warehouse exclusion not explicit; negative stock handling mentioned but could clarify 'not included' vs 'netted'. |
| Q23 | סיכון מתכלים | VERIFIED | 30% | 20% | 100% | 60% | 40% | 46% | +26pp | 15s |  Assistant invents impossible numbers (161,821 days = 444 years on grapes); ignores verified data-quality flag; conflates unreconciled counts with real overstock; fails to highlight strawberries (58 days, plausible) as the actionable signal. |
| Q24 | החזר על מבצע | VERIFIED | 20% | 15% | 100% | 30% | 25% | 34% | -0pp | 17s |  Assistant answered June 2026 (wrong month—question asks May); cited 25 items vs verified 3,707; ignored 65% genuine uplift finding; presented top-sales rows (irrelevant to uplift question); no tier breakdown matching ground truth. |
| Q25 | מרווח מבצע | VERIFIED | 75% | 65% | 100% | 60% | 80% | 75% | +52pp | 12s |  Assistant correctly identifies margin destroyers (17452, 15269, 16829, 21278) matching verified facts. Numbers align within tolerance. However: (1) rows include positive-margin promos (596, 19445, 8183) irrelevant to 'destroyed margin' question; (2) no explicit caveat that cost is period-averaged per prt or that structural loss-leaders (16829, 15269) are NOT promo-caused; (3) period anchoring (2025–2026) stated but not disclosed upfront as extraction date assumption. |
| Q26 | כיסוי מבצעים | VERIFIED | 92% | 88% | 100% | 85% | 90% | 91% | +56pp | 15s |  Numbers align with verified facts (25.1% discounted, 14.9% formal promo for Q2 2026). Trend narrative correct. Minor: full_data slice logic unclear (promo_net/disc_net fields undefined in catalog); rows match reference SQL exactly. Partial June not disclosed. |
| Q27 | תחרותיות מחיר | VERIFIED | 62% | 55% | 100% | 70% | 75% | 70% | +70pp | 15s |  Assistant's numbers (כץ +0.85%, בר כוכבא −0.15%) contradict verified facts (כץ +1.01%, בר כוכבא −4.48%). Magnitude error ~5×. Report choice (pricing-cost-drift) is reasonable but full_data aggregation appears incorrect or misaligned with reference method. Honesty: caveats stated but magnitude gap unacknowledged. Presentation clear but conclusions misleading. |
| Q28 | עומק הנחה | VERIFIED | 20% | 15% | 100% | 30% | 25% | 34% | +13pp | 18s |  Assistant's narrative (78% depth) contradicts verified ground truth (43–52% max). Row data shows ₪1–21K revenue, far below ₪50K materiality floor. Top-5 list partially aligns (אננס, עלית identified as losses) but depth numbers and margin calculations diverge significantly. Report choice and full_data slice appear misaligned with cost-complete, materiality-filtered logic. |
| Q29 | קניבליזציה | PARTIAL | 15% | 10% | 100% | 5% | 20% | 26% | +4pp | 16s |  Assistant fabricated numbers (6633% change, 215.4→3.2 reversal, impossible cannibalization scores). Ground truth shows modest −22% mate drop, not massive swings. Data is PARTIAL; assistant answered as if complete. No disclosure of causal limits or seasonal confounds. |
| Q30 | ערך לקוח | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +93pp | 11s |  Top 5 customers & departments match verified Tier A (משרדי סופרטל ₪310K beverages, household Type 900s ₪100–139K meat/produce/dairy). Period anchored to June 2026 (disclosed). Minor: basket ranges stated but not all rows shown; ~35% revenue caveat present but could emphasize anonymous exclusion more. |
| Q31 | ביצועי זכיין | VERIFIED | 92% | 88% | 100% | 95% | 90% | 93% | +81pp | 11s |  Numbers align with verified ground truth (גני תקווה ₪1.70M, 320K units). Minor variance in row totals (~1-2%) acceptable. Report choice (franchise-zakyan) fits. Caveats stated (cost-only, no revenue/margin). Clear Hebrew ranking. |
| Q32 | תמהיל לקוחות | VERIFIED | 20% | 30% | 100% | 20% | 10% | 33% | -13pp | 14s |  Assistant inverted the ground truth (64% identified vs 35% anonymous). Numbers, rankings, and narrative all contradict verified facts. Fabricated branch-level detail. Misread the data entirely. |
| Q33 | סימן נטישה | VERIFIED | 0% | 10% | 100% | 20% | 0% | 21% | -7pp | 11s |  Assistant claims data missing; VERIFIED ground truth shows 234 churned regulars (₪1.48M), Q2-2026 fully documented. Fabricated data gap; wrong report choice; no numbers delivered despite availability. |
| Q34 | הרכב סל | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +68pp | 12s |  Numbers match verified co-occurrence (produce+dairy 16,046). June-only window disclosed. Report choice (loyalty basket-composition) fits. Minor: percentages appear calculated post-hoc; no raw SQL shown but pre-validated report is correct method. Caveats stated but could emphasize department-level granularity limit. |
| Q35 | תלות בספק | VERIFIED | 95% | 95% | 100% | 92% | 93% | 95% | +38pp | 16s |  Numbers match verified facts (ביכורי 16.5%, top-3 = 28.9%, top-10 = 52.5%). Correct report (suppliers/dependency). Honest caveats on payment terms & returns. Clear Hebrew risk narrative. Minor: 'רכש' should be 'הכנסה' but context clear. |
| Q36 | עלות ספק | PARTIAL | 20% | 30% | 100% | 40% | 30% | 39% | +24pp | 14s |  Assistant invents extreme outliers (7403%, 455%) absent from verified ground truth. Correct top movers: לויתן +8.8%, ביכורי שדה +2.7%. Data window mismatch unresolved; narrative contradicts text. Report selection unclear. |
| Q37 | תנאי תשלום | NOT_ANSWERABLE | 100% | 100% | 100% | 100% | 85% | 99% | +69pp | 14s |  Correctly identified NOT_ANSWERABLE (PaymentTerms 0.7% populated, no payment-ledger data). Offered well-labeled proxy (top suppliers + margins). Minor: proxy doesn't directly answer 'utilization' but is honest about the gap. |
| Q38 | החזרי ספק | NOT_ANSWERABLE | 100% | 100% | 100% | 85% | 75% | 95% | +20pp | 16s |  Correctly identified NOT_ANSWERABLE: supplier-refund/incentive fields are empty (proven 0 across 8.96M rows). Offered relevant proxy (supplier dependency & margins). Minor: proxy data unrelated to original question; should emphasize data-gap severity more. |
| Q39 | ביצועי קניין | NOT_ANSWERABLE | 95% | 92% | 100% | 98% | 90% | 95% | +65pp | 11s |  Correctly identified NOT_ANSWERABLE (no buyer field), offered verified department-margin proxy with accurate numbers (פירות וירקות 41.8%, ₪54.1M leading absolute margin). Minor: narrative typo '4180%' should be '41.8%'. Data period and cost-NULL exclusion disclosed. |
| Q40 | תמהיל מחלקות | VERIFIED | 95% | 92% | 100% | 88% | 90% | 93% | +36pp | 12s |  Numbers match verified facts (פירות וירקות 20.6%, חלב וביצים 19.9% +1.27ppt). Report choice (category-mix/department-mix) fits. Minor: narrative field shows 0% (display bug); 2026H1 partial-period caveat could be more prominent in text. |
| Q41 | צמצום מק"טים | VERIFIED | 20% | 15% | 100% | 10% | 30% | 30% | +9pp | 15s |  Assistant fabricated item names, departments, and numbers. Ground truth: 4,009 items, ₪494K risk, 317K units. Assistant listed 15 cherry-picked rows with invented details (e.g., 'תפוז טרי סומיץ' 46K units, 'עגבניות מגי' 23K units) not in verified data. No disclosure of 2026H1 period, excluded departments (164, 204), or GREATEST(net,0) logic. Report 'category-mix' does not exist in catalog. Narrative contradicts numbers. Severe fabrication. |
| Q42 | פערי תמהיל | VERIFIED | 15% | 20% | 100% | 10% | 25% | 29% | +6pp | 12s |  Assistant reports fresh fish/poultry/meat as whitespace; verified ground truth identifies birthday products, candles, pet food, catering supplies. Completely wrong categories. Data fabricated. |
| Q43 | קליטת פריט חדש | VERIFIED | 10% | 15% | 100% | 30% | 20% | 29% | +29pp | 15s |  Assistant answered WRONG QUESTION. Ground truth compares 2026Q1 vs 2025Q1 cohorts (recent WORSE: 62% activation, ₪180 median). Assistant listed individual 2025 items with no cohort comparison, no 2026Q1 data, no activation %, no median. Fabricated 'strong performance' contradicts verified signal of quality drop. |
| Q44 | תרומת קבוצה | VERIFIED | 92% | 95% | 100% | 88% | 90% | 93% | +93pp | 21s |  Numbers align with verified ground truth (פירות ₪92.7K, ירקות ₪85.7K per SKU). Correct filtering (≥20 SKUs, >₪500K net). Minor: stated ₪21.4M vs verified ₪37.8M for ירקות suggests possible report-section mismatch or partial-period anchor not disclosed. Narrative clear, actionable. Method sound (category-mix report, group-contribution section). |
| Q45 | יעילות סניף | PARTIAL | 100% | 100% | 100% | 100% | 95% | 100% | +13pp | 9s |  Assistant correctly states sqm data missing, offers honest proxy (basket/scale/growth). Gani Tikva leads. Numbers match verified facts. Minor: could emphasize 'cannot rank by true ₪/sqm' more prominently in headline. |
| Q46 | חשיפת מע"מ | VERIFIED | 92% | 88% | 100% | 85% | 90% | 91% | +91pp | 20s |  Numbers match verified facts (97.09M ≈ 84.5M discrepancy unexplained; 14.04% blended vs 17-18% taxable correct). Exempt handling verified. Missing 2024 early months & branch-level detail. Clear Hebrew answer with caveats. |
| Q47 | חריגות קופה | VERIFIED | 92% | 88% | 100% | 85% | 90% | 91% | +69pp | 14s |  Correctly identified top outliers (1435: 3.64% vs 0.58×6.3; 1058: 3.37% vs 0.9×3.7) matching ground truth. Properly flagged system accounts (OvedC 2,3). Minor: register anomalies (107, 106, 31) not in reference output—likely valid but unverified. Caveats on anomaly≠misconduct stated. Hebrew narrative clear, leading with key numbers. ~15% tolerance met. |
| Q48 | התאמת ספרים כפולים | VERIFIED | 25% | 30% | 100% | 20% | 40% | 38% | +27pp | 13s |  Assistant contradicts verified ground truth: claims 18.4% gap is 'critical failure'; truth states it's a partial-month artifact, not a failure. Misinterprets June as 'not reconciled'; truth: June is incomplete-period, not a reconciliation failure. Invents 82.3% average and 'deterioration' narrative unsupported by facts. Correct report chosen but data misread and conclusions inverted. |
| Q49 | מכירות עובדים | PARTIAL | 20% | 15% | 100% | 30% | 25% | 34% | -43pp | 14s |  Assistant invents employee names & staffing-cost alignment despite PARTIAL status explicitly stating no payroll data & OvedC is opaque. Rows show 'person' id_kind without basis. Contradicts own caveat by presenting named rankings as fact. |
| Q50 | איפה להשקיע | PARTIAL | 20% | 15% | 100% | 30% | 25% | 34% | +9pp | 14s |  Assistant contradicts verified ground truth. Recommends 'בר כוכבא' (rank 4, +35% YoY) over 'אם המושבות' (rank 2, +15% YoY, ₪64.2M scale, 32.3% margin). Uses MoM data (irrelevant to expansion ROI), ignores full-year YoY scorecard. Misses documented top pick. Data rows are current-month snapshots, not YoY/margin/basket composites needed for capex decision. |

## Worst answers (total < 50%)
### Q4 מספר עסקאות — 34%
- judge: Assistant invents transaction counts (5516 total, 2216 etc.) and trend direction (claims DOWN -5.8%) contradicting verified facts (UP +0.5% to +3.2%). No raw numbers match. Fabricates revenue figures (556K₪/590K₪) not in ground truth. Claims 4 branches; only 3 exist on 06-27. Misrepresents report method.
- selected reports: sales-overview — expected one of: sales-overview, branch-performance
- assistant said: **עסקאות ביום המלא האחרון:** - סה"כ רשת: 5,516 קבלות - אם המושבות פ"ת: 2,216 קבלות (הסניף המוביל) - גני תקווה: 2,177 קבלות - רמת השרון: 1,123 קבלות  **המגמה: ירידה בכל הסניפים** הרשת כולה ירדה ב-5.8% מול אותו יום בשבוע שעבר (556K₪ לעומת 590K₪). אם המושבות הראת
- assistant sql: `report: sales-overview (daily-pulse summary); full_data slice: SELECT branch, receipts AS today_receipts, net AS today_net, basket FROM full_data WHERE d = (SELECT max(d) FROM full_data) ORDER BY receipts DESC LIMIT 20`

### Q5 שעות שיא — 35%
- judge: Assistant answered NETWORK-WIDE hours (12h: 74.6k tx) instead of PER-BRANCH peaks. Ground truth requires branch-level archetypes (EVENING vs MIDDAY). No branch names, no staffing fit judgment. Fabricated basket-size analysis without per-branch data. Wrong report section.
- selected reports: sales-overview — expected one of: sales-overview
- assistant said: **שעות המכירה החזקות:**  הנתונים מציגים שני שיאים ברורים: - **שיא ראשי: 11:00-13:00** – 71,124 עסקאות, ₪6.73M הכנסה (23% מסך היומי), סל ממוצע ₪92-98 - **שיא משני: 17:00-19:00** – 74,164 עסקאות, ₪6.59M הכנסה (21% מסך היומי), סל ממוצע ₪87-90  **הערכת איוש:**  ⚠️
- assistant sql: `report: sales-overview (hours-and-days); full_data slice: SELECT hour_of_day, round(sum(net)) AS net, sum(receipts) AS receipts FROM full_data GROUP BY 1 ORDER BY 2 DESC LIMIT 15`

### Q6 מגמת מכירות — 34%
- judge: Assistant fabricates monthly aggregations and promo % splits not in data; ignores verified 12-week window (2026-03-30 to 2026-06-21); includes partial week 06-22; contradicts ground truth (FLAT, not -7% decline); wrong analytical framing.
- selected reports: sales-overview — expected one of: sales-overview
- assistant said: **מגמת ירידה** בהכנסות נטו בנטרול מבצעים ב-12 השבועות האחרונים.  בחישוב הכנסה ללא השפעת מבצעים (net minus promo contribution):  - **מאי 2026**: ₪27.9M, מבצעים תרמו **14.8%** = ₪4.1M → הכנסה בסיס **₪23.8M** - **אפריל 2026**: ₪27.4M, מבצעים **14.7%** = ₪4.0M → ה
- assistant sql: `report: sales-overview (trend); full_data slice: SELECT date_trunc('week', d::date)::date AS x, round(sum(net - promo_net)) AS y FROM full_data WHERE d::date >= (SELECT max(d::date) - INTERVAL 84 DAY FROM full_data) GROUP BY 1 ORDER BY 1 ASC`

### Q16 מלאי שלילי — 43%
- judge: Assistant fabricated monetary loss values (₪308K for 'Agami bread') and item rankings with no cost data in ground truth. Conflated unit negatives with financial impact. Ignored artifact/suspicious split clarity. No disclosure of cost-data absence.
- selected reports: inventory-health — expected one of: inventory-health
- assistant said: **ממצאים עיקריים:**  המלאי השלילי מתחלק לשתי קטגוריות:  1. **ארטיפקטים תפעוליים** (לא חשודים):    - שקיות ופקדונות הנמכרים בקופה ללא קליטה מראש    - סחף שקילה בירקות בתחנות שקילה    - אלו משקפים שגיאות תהליך, לא גניבה  2. **פריטים ארוזים חשודים** (דורשים בדיקה
- assistant sql: `report: inventory-health (negative-stock); full_data slice: SELECT item, round(sum(abs(neg_stock_qty * unit_cost))) AS loss_value FROM full_data WHERE kind = 'packaged_suspicious' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`

### Q19 פחת — 34%
- judge: Assistant fabricated ₪1.2M and ₪308K numbers absent from verified ₪4.27M proxy. Rows invented; no report catalog exists. Ignored receiving-gap caveat.
- selected reports: inventory-health — expected one of: inventory-health
- assistant said: **ניתוח פערי מלאי וחשד לאובדן**  הדוח מזהה **₪1.2 מיליון** בהפסדים פוטנציאליים מ-25 פריטים עם מלאי שלילי. עם זאת, יש להבחין בין שתי קטגוריות:  **ארטיפקטים תפעוליים (לא אובדן):** - שקיות ופקדונות שנמכרים בקופה ללא קליטה מראש - סחף שקילה בירקות בתחנות שקילה - אל
- assistant sql: `report: inventory-health (negative-stock); full_data slice: SELECT item, round(sum(loss_proxy_ils)) AS loss_ils FROM full_data WHERE kind = 'packaged_suspicious' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`

### Q23 סיכון מתכלים — 46%
- judge: Assistant invents impossible numbers (161,821 days = 444 years on grapes); ignores verified data-quality flag; conflates unreconciled counts with real overstock; fails to highlight strawberries (58 days, plausible) as the actionable signal.
- selected reports: inventory-health — expected one of: inventory-health
- assistant said: **פריטים מתכלים בעודף קיצוני:**  1. **שרי לובלו תמר** – 4 מיקומים עם עודף משמעותי:    - גני תקווה: 528 ימי כיסוי, ₪120,152    - אם המושבות: 734 ימי כיסוי, ₪75,348    - רמת השרון: 4,013 ימי כיסוי, ₪36,121    - בר כוכבא: 1,120 ימי כיסוי, ₪25,021  2. **תפוח אדמה*
- assistant sql: `report: inventory-health (overstock); full_data slice: SELECT item, dept, location, stock_qty, daily_rate, days_cover, round(tied_cash_ils) AS tied_cash_ils FROM full_data WHERE (dept LIKE '' OR dept LIKE '' OR dept LIKE '' OR dept LIKE '' OR dept LIKE '' OR dept LIKE '') AND days_cover > 14 ORDER B`

### Q24 החזר על מבצע — 34%
- judge: Assistant answered June 2026 (wrong month—question asks May); cited 25 items vs verified 3,707; ignored 65% genuine uplift finding; presented top-sales rows (irrelevant to uplift question); no tier breakdown matching ground truth.
- selected reports: promotions — expected one of: promotions
- assistant said: **תוצאה מעורבת**: המבצעים של יוני 2026 יצרו uplift אמיתי בחלק מהפריטים, אך בחלק משמעותי היוו בעיקר שחיקת מרווח.  **הנתונים:** - **6 פריטים בעלי uplift חזק** (3.0x ומעלה): אבטיח (**3.05x**), קלמנטינה (**3.15x**), משמש (**7.06x**), ביצים 12 יח' (**38.37x**), קוק
- assistant sql: `report: promotions (uplift); full_data slice: SELECT item, round(sum(qty_own_unit)) AS total_qty, round(sum(promo_net)) AS promo_sales FROM full_data WHERE ym = '2026-06' AND had_promo = 1 GROUP BY 1 ORDER BY 3 DESC LIMIT 15`

### Q28 עומק הנחה — 34%
- judge: Assistant's narrative (78% depth) contradicts verified ground truth (43–52% max). Row data shows ₪1–21K revenue, far below ₪50K materiality floor. Top-5 list partially aligns (אננס, עלית identified as losses) but depth numbers and margin calculations diverge significantly. Report choice and full_data slice appear misaligned with cost-complete, materiality-filtered logic.
- selected reports: pricing-cost-drift — expected one of: pricing-cost-drift
- assistant said: **5 פריטים עם עומק הנחה מקסימלי (52.2%-40.4%):**  1. **אננס יבוא** (עומק **52.2%**, הנחה נטו **₪77K**) – מרווח **-15.2%** → **הפסד**, הנחה **לא מוצדקת** 2. **משקה אנרגיה בלו** (עומק **45.7%**, הנחה **₪58K**) – מרווח **+33.5%** → רווחי, מוצדק 3. **מגבונים KIDDO
- assistant sql: `report: pricing-cost-drift (discount-depth); full_data slice: SELECT item, dept, round(depth_wtd_pct) AS depth, round(disc_net) AS revenue, round(disc_margin_pct) AS margin FROM full_data WHERE depth_wtd_pct > 0 AND disc_net > 1000 ORDER BY depth_wtd_pct DESC LIMIT 15`

### Q29 קניבליזציה — 26%
- judge: Assistant fabricated numbers (6633% change, 215.4→3.2 reversal, impossible cannibalization scores). Ground truth shows modest −22% mate drop, not massive swings. Data is PARTIAL; assistant answered as if complete. No disclosure of causal limits or seasonal confounds.
- selected reports: promotions — expected one of: promotions
- assistant said: **כן, בבירור יש קניבליזציה משמעותית.**  הנתונים מראים שמבצעים אינטנסיביים גוזלים מכירות במחיר מלא מקבוצות תחליפיות:  **המקרה החמור ביותר – פסח:** - 4 חודשי מבצע בלבד, אך ירידה של **6,633%** במכירות מחיר מלא (מ-3.2 ל-215.4 יחידות ליום) - הקבוצה גדלה בסך הכל ב-1
- assistant sql: `report: promotions (cannibalization - summary)`

### Q32 תמהיל לקוחות — 33%
- judge: Assistant inverted the ground truth (64% identified vs 35% anonymous). Numbers, rankings, and narrative all contradict verified facts. Fabricated branch-level detail. Misread the data entirely.
- selected reports: customers-loyalty — expected one of: customers-loyalty
- assistant said: **חלוקת הכנסות לפי סוג לקוח (12 חודשים אחרונים)**  **סך הכנסה נטו: 304.66 מיליון שקל**  | סוג לקוח | סה"כ (מיליון ₪) | אחוז | |---------|----------------|------| | **לקוחות מזוהים** | 195.5 | **64.1%** | | **לקוחות אנונימיים** | 101.2 | **33.2%** | | **וולט** 
- assistant sql: `report: customers-loyalty (mix); full_data slice: SELECT segment, round(sum(net)) AS net FROM full_data GROUP BY 1 ORDER BY 2 DESC`

### Q33 סימן נטישה — 21%
- judge: Assistant claims data missing; VERIFIED ground truth shows 234 churned regulars (₪1.48M), Q2-2026 fully documented. Fabricated data gap; wrong report choice; no numbers delivered despite availability.
- selected reports: customers-loyalty — expected one of: customers-loyalty
- assistant said: הנתונים המסופקים מכילים רשימת 25 לקוחות עם הוצאות גבוהות בשנה הקודמת, אך **לא כוללים מידע על פעילות ברבעון האחרון (90 הימים האחרונים)** הדרוש לזיהוי לקוחות שנטשו.  כדי לזהות לקוחות קבועים שהפסיקו לקנות ברבעון האחרון, נדרש: - נתוני קבלות/הוצאות בתקופת 90 הימים 
- assistant sql: `report: customers-loyalty (churn-signals)`

### Q36 עלות ספק — 39%
- judge: Assistant invents extreme outliers (7403%, 455%) absent from verified ground truth. Correct top movers: לויתן +8.8%, ביכורי שדה +2.7%. Data window mismatch unresolved; narrative contradicts text. Report selection unclear.
- selected reports: suppliers — expected one of: suppliers
- assistant said: **התייקרויות ספקים משמעותיות:**  על בסיס הנתונים המשוקללים בהכנסה, שלושת הספקים שהעלו מחירים בצורה הבולטת ביותר הם:  1. **י.ד עידה בע"מ** – התייקרות של **455.2%** (הכנסה: 2.7M₪, 542 פריטים) 2. **היכל היין שקד גולן בע"מ** – התייקרות של **157.3%** (הכנסה: 3.7M₪,
- assistant sql: `report: suppliers (cost-increases); full_data slice: SELECT supplier, round(sum(inflation_pct * rev) / sum(rev), 1) AS avg_inflation_pct, round(sum(rev)) AS total_rev FROM full_data WHERE rev > 10000 GROUP BY 1 HAVING sum(rev) > 0 ORDER BY 2 DESC LIMIT 15`

### Q41 צמצום מק"טים — 30%
- judge: Assistant fabricated item names, departments, and numbers. Ground truth: 4,009 items, ₪494K risk, 317K units. Assistant listed 15 cherry-picked rows with invented details (e.g., 'תפוז טרי סומיץ' 46K units, 'עגבניות מגי' 23K units) not in verified data. No disclosure of 2026H1 period, excluded departments (164, 204), or GREATEST(net,0) logic. Report 'category-mix' does not exist in catalog. Narrative contradicts numbers. Severe fabrication.
- selected reports: category-mix — expected one of: category-mix
- assistant said: **פריטים למחיקה דחופה - צמצום מק"טים**  **המועמדים החזקים ביותר להסרה:**  1. **תפוז טרי סומיץ** (64324) - 46,338 יחידות מלאי, אפס מכירות ב-180 ימים 2. **עגבניות מגי** (60024) - 23,183 יחידות, אפס מכירות 3. **ערכת אנגוס לטחינה** (63784) - 19,722 יחידות, ₪67 מכי
- assistant sql: `report: category-mix (sku-rationalization)`

### Q42 פערי תמהיל — 29%
- judge: Assistant reports fresh fish/poultry/meat as whitespace; verified ground truth identifies birthday products, candles, pet food, catering supplies. Completely wrong categories. Data fabricated.
- selected reports: category-mix — expected one of: category-mix
- assistant said: על סמך נתוני תרומת הקבוצות, קיימות **3 קבוצות whitespace** עם מרווח גבוה אך נתח הכנסה נמוך:  1. **דגים טריים** — רווח לפריט: **₪73,199** | הכנסה נטו: **₪6.6M** (נתח <1.5%)    - קבוצה קטנה (29 SKU) עם רווחיות יוצאת דופן — הרחבה פוטנציאלית גבוהה  2. **עוף והודו 
- assistant sql: `report: category-mix (group-contribution)`

### Q43 קליטת פריט חדש — 29%
- judge: Assistant answered WRONG QUESTION. Ground truth compares 2026Q1 vs 2025Q1 cohorts (recent WORSE: 62% activation, ₪180 median). Assistant listed individual 2025 items with no cohort comparison, no 2026Q1 data, no activation %, no median. Fabricated 'strong performance' contradicts verified signal of quality drop.
- selected reports: category-mix — expected one of: category-mix
- assistant said: **ביצועי פריטים חדשים חזקים מול הציפיות:**  תות שדה הוא הכוכב המובהק — **649,858₪** בנטו ב-13 השבועות הראשונים (פתח 13.11.25), עם 3 SKU נוספים של אותו פריט שהניבו **150K-149K₪** כל אחד. זה משקף ביקוש חזק בקטגוריית ירקות/פירות.  בשר ועוף טרי הראה קליטה טובה — ב
- assistant sql: `report: category-mix (new-items: summary)`

### Q48 התאמת ספרים כפולים — 38%
- judge: Assistant contradicts verified ground truth: claims 18.4% gap is 'critical failure'; truth states it's a partial-month artifact, not a failure. Misinterprets June as 'not reconciled'; truth: June is incomplete-period, not a reconciliation failure. Invents 82.3% average and 'deterioration' narrative unsupported by facts. Correct report chosen but data misread and conclusions inverted.
- selected reports: operations-audit — expected one of: operations-audit
- assistant said: **התאמת ספרים: מצב חלקי עם סטיות הולכות וגדלות**  **ממצאים עיקריים:** - **טווח התאמה תקין (95-105%):** פברואר–אפריל 2026 מתואמים כראוי (95.9%–98%) - **ממוצע התאמה:** 82.3% (מעוות בגלל סטיות במאי–יוני) - **מגמה:** התדרדרות משמעותית החל ממאי 2026  **סטיות קריטיו
- assistant sql: `report: operations-audit (ledger-reconciliation); full_data slice: SELECT ym, round(sum(lk_gross)) AS total_lk, round(sum(main670_gross)) AS total_main, round(sum(main670_gross) / sum(lk_gross) * 100, 2) AS match_pct FROM full_data WHERE main670_gross IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12`

### Q49 מכירות עובדים — 34%
- judge: Assistant invents employee names & staffing-cost alignment despite PARTIAL status explicitly stating no payroll data & OvedC is opaque. Rows show 'person' id_kind without basis. Contradicts own caveat by presenting named rankings as fact.
- selected reports: operations-audit — expected one of: operations-audit
- assistant said: **מגבלה מהותית:** מערכת קומקס אינה מאחסנת שמות עובדים או נתוני עלויות איוש/שכר. מזהי הקופאים (OvedC) הם אנונימיים לחלוטין, ולכן אין אפשרות לזהות עובדים ספציפיים או להשוות בין ביצועים למשכורות.  **הקופאים המובילים במספר קבלות (proxy למכירות):** 1. **קופאי 1383*
- assistant sql: `report: operations-audit (cashier-anomalies)`

### Q50 איפה להשקיע — 34%
- judge: Assistant contradicts verified ground truth. Recommends 'בר כוכבא' (rank 4, +35% YoY) over 'אם המושבות' (rank 2, +15% YoY, ₪64.2M scale, 32.3% margin). Uses MoM data (irrelevant to expansion ROI), ignores full-year YoY scorecard. Misses documented top pick. Data rows are current-month snapshots, not YoY/margin/basket composites needed for capex decision.
- selected reports: branch-performance — expected one of: branch-performance
- assistant said: **סניף "בר כוכבא פתח תקווה"** מציג את פוטנציאל ההחזר הגבוה ביותר להרחבה:  **מדדי ביצוע:** - צמיחה YoY: **35.4%** במחזור ו-**44.7%** בתקבולים (הגבוה ביותר בשרשרת) - מחזור חודשי: **₪2.49M** (מקום 4 בדירוג) - סל ממוצע: **₪74.2** עם יציבות חודשית (+0.2% MoM) - תקב
- assistant sql: `report: branch-performance (ranking + growth)`

