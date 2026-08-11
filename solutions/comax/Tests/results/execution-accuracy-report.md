# Comax agents — execution accuracy (deterministic)

Gold = verified-questions.md refSql executed on the local duckdb (gold-results.json). An agent answer matches when its
stored SQL, executed on the same data, contains every gold column (unordered, distinct columns, rel 2% / abs 1 tolerance).
NOT_ANSWERABLE questions are excluded. Stricter than the LLM judge: undisclosed-equivalent period anchors count as mismatch.

| run | execAcc | match | mismatch | exec-error | no-sql | gradable |
|---|---|---|---|---|---|---|
| retrievalAnalytics | **28%** | 13 | 32 | 1 | 1 | 47 |
| basicAnalytics | **0%** | 0 | 9 | 17 | 21 | 47 |
| basicFinalAnswer | **0%** | 0 | 38 | 2 | 7 | 47 |
| reportsAnalytics | **34%** | 16 | 31 | 0 | 0 | 47 |

| id | retrievalAnalytics | basicAnalytics | basicFinalAnswer | reportsAnalytics |
|---|---|---|---|---|
| Q1 | 💥 | ❌ | 💥 | ✅ |
| Q2 | ✅ | — | ❌ | ✅ |
| Q3 | ✅ | — | ❌ | ✅ |
| Q4 | ✅ | ❌ | ❌ | ❌ |
| Q5 | ❌ | 💥 | ❌ | ❌ |
| Q6 | ✅ | — | ❌ | ❌ |
| Q7 | ❌ | — | ❌ | ✅ |
| Q8 | ❌ | — | ❌ | ❌ |
| Q9 | ❌ | — | ❌ | ❌ |
| Q10 | ❌ | — | 💥 | ❌ |
| Q11 | — | — | — | ❌ |
| Q12 | ❌ | 💥 | — | ❌ |
| Q13 | ❌ | — | ❌ | ❌ |
| Q14 | ❌ | — | ❌ | ❌ |
| Q15 | ✅ | — | ❌ | ✅ |
| Q16 | ❌ | 💥 | ❌ | ❌ |
| Q17 | ❌ | 💥 | ❌ | ✅ |
| Q18 | ✅ | — | ❌ | ✅ |
| Q19 | ❌ | ❌ | ❌ | ✅ |
| Q20 | ✅ | — | — | ❌ |
| Q21 | ❌ | — | ❌ | ❌ |
| Q22 | ✅ | — | ❌ | ✅ |
| Q23 | ❌ | 💥 | ❌ | ❌ |
| Q24 | ❌ | 💥 | ❌ | ❌ |
| Q25 | ❌ | 💥 | ❌ | ❌ |
| Q26 | ❌ | 💥 | ❌ | ✅ |
| Q27 | ❌ | 💥 | ❌ | ❌ |
| Q28 | ❌ | 💥 | — | ❌ |
| Q29 | ❌ | 💥 | ❌ | ❌ |
| Q30 | ❌ | — | — | ✅ |
| Q31 | ✅ | 💥 | ❌ | ✅ |
| Q32 | ❌ | 💥 | ❌ | ✅ |
| Q33 | ❌ | 💥 | ❌ | ❌ |
| Q34 | ❌ | 💥 | — | ✅ |
| Q35 | ✅ | — | ❌ | ✅ |
| Q36 | ❌ | 💥 | ❌ | ❌ |
| Q37 | n/a | n/a | n/a | n/a |
| Q38 | n/a | n/a | n/a | n/a |
| Q39 | n/a | n/a | n/a | n/a |
| Q40 | ❌ | ❌ | ❌ | ❌ |
| Q41 | ❌ | ❌ | ❌ | ❌ |
| Q42 | ❌ | — | ❌ | ❌ |
| Q43 | ✅ | — | ❌ | ❌ |
| Q44 | ❌ | — | — | ❌ |
| Q45 | ✅ | ❌ | ❌ | ❌ |
| Q46 | ❌ | — | ❌ | ❌ |
| Q47 | ❌ | ❌ | ❌ | ❌ |
| Q48 | ✅ | ❌ | ❌ | ✅ |
| Q49 | ❌ | ❌ | ❌ | ❌ |
| Q50 | ❌ | 💥 | ❌ | ❌ |
