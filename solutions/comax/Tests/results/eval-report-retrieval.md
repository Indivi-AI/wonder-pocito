# Comax analytics LLM-flow — BI evaluation report

Workflow: **retrievalAnalytics** (gemini-3.5-flash main) on the 3 verified retail-manager questions (ground truth: verified-questions.md). Judge: openai/gpt-5.4.
Weights: accuracy 0.45 / method 0.25 / honesty 0.2 / presentation 0.1.

## Overall
- **Total score: 65%** — accuracy 65%, method 64%, honesty 66%, presentation 64%
- Flow errors: 1/3 · avg duration 71.1s · avg tokens in/out 12775/0

## By category
| category | n | total | accuracy | method | honesty | flow errors |
|---|---|---|---|---|---|---|
| מכירות | 1 | 95% | 95% | 92% | 98% | 0 |
| רווחיות | 1 | 0% | 0% | 0% | 0% | 1 |
| ספקים | 1 | 99% | 100% | 100% | 100% | 0 |

## Per question
| id | label | status | acc | method | honesty | pres | total | dur | notes |
|---|---|---|---|---|---|---|---|---|---|
| Q2 | דירוג סניפים | VERIFIED | 95% | 92% | 98% | 96% | 95% | 15s |  Numbers match verified truth (8.12M, 6.34M leaders; 0.35M weakest real branch). Period 202605 correctly anchored as latest complete month. SQL correctly computes net=Scm-VatAmount. Minor: SQL date filter (>=2024-01-01) is redundant but harmless; parquet path/dialect differ from reference (expected). Dead store flagged appropriately. |
| Q14 | רווח פריט | VERIFIED | 0% | 0% | 0% | 0% | 0% | 181s | 💥 flow error: flow timeout 180s |
| Q37 | תנאי תשלום | NOT_ANSWERABLE | 100% | 100% | 100% | 95% | 99% | 17s |  Correctly identified NOT_ANSWERABLE; disclosed both data gaps (0.66% PaymentTerms coverage, no AP ledger); SQL method sound; Hebrew narrative clear and actionable. Minor: could have named top suppliers by volume as proxy. |

## Worst answers (total < 50%)
### Q14 רווח פריט — 0% (flow error)
- judge: flow error: flow timeout 180s
- assistant said: 
- assistant sql: ``

