# Parquet Scan Tiers

*Routing analytical queries by physical scan size, reuse, and workload frequency*

# 1. The Query Router

The Query Router, implemented as a hot Lambda, keeps Parquet footers and row-group/column metadata readily available. It analyzes each query to
determine the required row groups and columns and estimates the total S3 scan size before execution.

Small scans, such as **≤100 MB**, are routed to a stateless Lambda that fetches only the required S3 ranges into `/tmp`. Larger or repeated scans are
routed to a get-or-create ECS worker with a reusable local cache.

```text
SQL query
   ↓
hot Query Router Lambda
   ├─ Parquet footers
   ├─ row-group statistics
   ├─ required columns
   └─ estimated S3 range bytes
          │
          ├─ small, selective scan → stateless Lambda → S3 ranges → /tmp → result
          └─ large or repeated scan → get-or-create ECS → EBS cache ↔ S3 → result
```

# 2. Scanning Architecture

<table>
  <thead><tr>
    <th>Tier</th><th>Architecture</th><th>Data / cache</th><th>Strategy</th>
    <th>100 q/day</th><th>1K q/day</th><th>10K q/day</th>
  </tr></thead>
  <tbody>
    <tr>
      <td><strong>1 — Stateless Lambda</strong></td><td>Router → Lambda → S3 Range GET → <code>/tmp</code> → Parquet scan</td>
      <td><strong>≤100 MB scan</strong></td>
      <td>Fetch only required Parquet ranges; <code>/tmp</code> is opportunistic cache; Lambda disappears when idle</td>
      <td><strong>~$0.20/mo</strong></td><td><strong>~$2/mo</strong></td><td><strong>~$20/mo</strong></td>
    </tr>
    <tr>
      <td><strong>2 — Get-or-create ECS</strong></td><td>Router → ECS → local EBS cache → S3</td>
      <td><strong>~1 GB cache</strong></td>
      <td>~2 min cold start; keep warm while expected query gap &lt;~2 min; otherwise recreate before the predicted query</td>
      <td><strong>~$20/mo</strong></td><td><strong>~$50/mo</strong></td><td><strong>~$50/mo</strong></td>
    </tr>
    <tr>
      <td><strong>3a — Full replicated data</strong></td><td>Always-on HDFS / replicated storage cluster</td>
      <td><strong>100 GB full dataset</strong></td><td>Keep full dataset continuously available; typically 3× replication</td>
      <td><strong>~$250+/mo</strong></td><td><strong>~$250+/mo</strong></td><td><strong>~$250+/mo</strong></td>
    </tr>
    <tr>
      <td><strong>3b — Full replicated data</strong></td><td>Always-on HDFS / replicated storage cluster</td>
      <td><strong>1 TB full dataset</strong></td><td>Keep full dataset continuously available; typically 3× replication</td>
      <td><strong>~$500+/mo</strong></td><td><strong>~$500+/mo</strong></td><td><strong>~$500+/mo</strong></td>
    </tr>
    <tr>
      <td><strong>3c — 100-node Trino cluster</strong></td><td>100 always-on Trino/HDFS nodes</td>
      <td><strong>1 TB full dataset</strong></td><td>100 workers always warm; ~3 TB physical storage with 3× replication</td>
      <td><strong>~$7K/mo</strong></td><td><strong>~$7K/mo</strong></td><td><strong>~$7K/mo</strong></td>
    </tr>
    <tr>
      <td><strong>3d — 100-node Trino cluster</strong></td><td>100 always-on Trino/HDFS nodes</td>
      <td><strong>1 PB full dataset</strong></td><td>100 workers always warm; ~3 PB physical storage with 3× replication</td>
      <td><strong>&gt;$50K/mo</strong></td><td><strong>&gt;$50K/mo</strong></td><td><strong>&gt;$50K/mo</strong></td>
    </tr>
  </tbody>
</table>
