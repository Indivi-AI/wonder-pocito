# Pricing — verified 2026-08, re-pin before quoting

## BigQuery (service 24E6-581D-38E5)
| region | on-demand analysis |
|---|---|
| US multi-region | $6.25 / TiB |
| me-west1 (Tel Aviv) | $7.50 / TiB |

Editions/slot rates are contract-specific. Winner's autopsy assumed $0.06/slot-hour (Enterprise list);
Standard ~$0.04, Plus ~$0.10. Always ask which edition rather than assuming.

Minimum billing: 10 MB per table per query. Any benchmark below that bills the floor and tells you nothing.

## Cloud Run (service 152E-C115-5142), me-west1
| resource | rate |
|---|---|
| Jobs CPU | $0.000018 / vCPU-s |
| Jobs Memory | $0.000002 / GiB-s |
| Services CPU (instance-based) | $0.000018 / s |
| Services Memory (instance-based) | $0.000002 / GiB-s |

Note these are BELOW the us-central1 list figures ($0.000024 / $0.0000025) often quoted from memory.

`$/run = billable_seconds × (vCPU × cpu_rate + GiB × mem_rate)`

## Pulling them fresh
```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://cloudbilling.googleapis.com/v1/services/<SERVICE_ID>/skus?pageSize=2000"
```
Filter on `serviceRegions` and `description`; take `pricingInfo[].pricingExpression.tieredRates[].unitPrice`
(`units` + `nanos/1e9`).
