# Why Parquet Structure Matters for Fast Queries

If you think you already know this, feel free to scroll down. There is a summary table at the end, followed by useful references for you—or your LLM.

Otherwise, let's start with a simple coffee business and follow the bytes.

## Part I — Why Columnar Storage Is Fast

# 1. From Coffee Sales to Business Questions

Imagine a coffee-shop network similar to Starbucks.

Over the last three years, the network collected about **100 MB of sales data**. Every transaction produces a row describing what was sold, where it was sold, when it happened, and for how much.

The original data could look like a CSV file:

```csv id="64ypvk"
timestamp,branch_id,city,product,flavor,size,quantity,unit_price,payment_type,customer_id
2026-07-14 08:13:21,BR017,London,Latte,Vanilla,Large,2,5.20,Card,C839201
2026-07-14 08:14:03,BR042,Manchester,Espresso,Classic,Single,1,2.80,Cash,C104833
2026-07-14 08:14:18,BR017,London,Cold Brew,Caramel,Medium,1,4.90,App,C550182
```

There are **10 columns**, and in the real file there may be hundreds of thousands or millions of rows.

The interesting question is:

> **How do we search through it quickly enough to turn it into useful business information?**

## What the Business Wants to Know

A manager does not want to look at transaction rows.

They want a dashboard.

### Coffee Network — July Dashboard

| Metric               |   Value |
| -------------------- | ------: |
| Sales last month     |  $1.82M |
| Morning sales        |   $780K |
| Evening sales        |   $410K |
| Best-selling flavor  | Vanilla |
| Best-selling product |   Latte |

Behind each number is a query.

For example:

```sql
SELECT
    SUM(quantity * unit_price) AS revenue
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp < '2026-08-01';
```

Or:

```sql
SELECT
    flavor,
    SUM(quantity) AS cups
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp < '2026-08-01'
GROUP BY flavor
ORDER BY cups DESC
LIMIT 1;
```

These queries look simple.

But underneath them is the main subject of this paper:

> **What data does the computer actually have to read in order to answer the query?**

---

# 2. Fast Queries Start by Reading Less

Consider the monthly revenue query:

```sql
SELECT
    SUM(quantity * unit_price)
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp < '2026-08-01';
```

Our dataset has 10 columns, but this query needs only three:

```text
timestamp
quantity
unit_price
```

The other seven columns are irrelevant.

If the data is stored as ordinary CSV rows, we keep encountering information the query does not need.

> **Query performance is often less about processing data faster and more about reading less data in the first place.**

## Why Reading Less Matters

Data must physically move before the CPU can process it.

| Storage        | Example throughput | Time to move 100 MB |
| -------------- | -----------------: | ------------------: |
| Object storage |      ~100–500 MB/s |        ~200–1000 ms |
| Local SSD      |          ~1–5 GB/s |          ~20–100 ms |
| Memory         |      ~20–100+ GB/s |             ~1–5 ms |

These are illustrative numbers rather than guarantees.

```text
Object Store / Network
          ↓
         SSD
          ↓
        Memory
          ↓
         CPU
```

If a query needs only 20 MB of useful information from a 100 MB dataset, reading all 100 MB and throwing away 80 MB is work that ideally should never happen.

---

# 3. Why Columnar Storage Is Fast

## From Rows to Columns

CSV is organized by rows:

```text
08:13 | BR17 | London | Latte    | Vanilla | Large  | 2 | 5.20 | Card | C839201
08:14 | BR42 | Leeds  | Espresso | Classic | Single | 1 | 2.80 | Cash | C104833
08:14 | BR17 | London | ColdBrew | Caramel | Medium | 1 | 4.90 | App  | C550182
```

Analytical queries frequently use only a few columns.

Columnar storage organizes values by column, so our revenue query can read only:

```text
timestamp
quantity
unit_price
```

instead of all ten columns.

## Binary Instead of Text

Columnar formats also do not need to store values as human-readable text.

Timestamps, integers, and prices can be stored as compact typed binary values that are closer to what the CPU needs for comparisons and calculations.

## Columns Compress Extremely Well

Values within one column tend to resemble each other:

```text
branch_id:
BR017
BR017
BR017
BR042
...

flavor:
Vanilla
Vanilla
Caramel
Vanilla
...
```

That repetition makes column encoding and compression effective.

Real columnar formats use techniques such as dictionary encoding, run-length encoding, bit packing, delta encoding, and compression algorithms.

```text
                    Columnar storage
                          │
          ┌───────────────┼────────────────┐
          ↓               ↓                ↓
   fewer columns       binary data      compression
          │               │                │
          └───────────────┴────────────────┘
                          ↓
                   fewer bytes read
                          ↓
                    faster queries
```

---

## Part II — Skipping Rows with Parquet Structure

# 4. The Cost of Scanning Too Much

Suppose **80% of the dashboard queries are about today or yesterday**.

But our Parquet file contains three years of sales.

One day is only:

```text
1 / (3 × 365) ≈ 0.09%
```

of the data.

So the hottest part of our dataset is tiny:

```text
3 years of data
│
├─ HOT   0.09%  ▏ today / yesterday
├─ WARM  ~2%    ██ recent weeks
└─ COLD  ~98%   ███████████████████████████████████████████████
```

> **80% of our queries may care about less than 1% of our data.**

Sorting by timestamp helps organize the data, but **a Parquet scan does not behave like a database B-tree index**. Sorting alone does not give us direct row access.

We need large physical regions of the file to be independently skippable.

---

# 5. Partitioning the Data by Time

One solution is separate files:

```text
sales/
    2026-08-24.parquet
    2026-08-25.parquet
    2026-08-26.parquet
    2026-08-27.parquet
```

But a partition does **not have to be a separate file**.

Parquet already contains an internal partition-like structure: the **row group (RG)**.

```text
sales.parquet

RG → 2026-08-24
RG → 2026-08-25
RG → 2026-08-26
RG → 2026-08-27
...
```

Now each day is independently skippable.

For three years of data:

```text
Query         Data scanned

3 years       ████████████████████████████████████  100%
1 year        ████████████                           ~33%   → 3× less
1 month       █                                      ~2.7%  → 36× less
1 week        ▏                                      ~0.6%  → 156× less
1 day         ▏                                      ~0.09% → 1,095× less
```

The key idea is:

> **one day = one independently skippable physical batch**

That batch can be a file, but it can also be a row group inside a larger Parquet file.

---

# 6. How Parquet Knows Which Row Groups to Skip

If yesterday is one row group inside a large Parquet file, how can the query engine find it without scanning all the others?

The answer is the **Parquet footer**.

```text
┌─────────────────────────────────────┐
│ Row Group 1                         │
├─────────────────────────────────────┤
│ Row Group 2                         │
├─────────────────────────────────────┤
│ Row Group 3                         │
├─────────────────────────────────────┤
│ Footer                              │
└─────────────────────────────────────┘
```

For our purpose, two pieces of footer information are especially important:

* **min/max values** for columns inside row groups
* **physical locations** of column chunks in the file

For example:

```text
RG 1
    timestamp.min = 2026-08-24 00:00
    timestamp.max = 2026-08-24 23:59

RG 2
    timestamp.min = 2026-08-25 00:00
    timestamp.max = 2026-08-25 23:59

RG 3
    timestamp.min = 2026-08-26 00:00
    timestamp.max = 2026-08-26 23:59
```

For:

```sql
WHERE timestamp >= '2026-08-26'
  AND timestamp < '2026-08-27'
```

the engine can reason:

```text
RG 1  Aug 24  → skip
RG 2  Aug 25  → skip
RG 3  Aug 26  → READ
RG 4  Aug 27  → skip
```

The engine does not need to scan the timestamp values in RG 1 and RG 2 to discover that they are irrelevant.

> **The footer does not create the organization. It exposes the organization we created so the query engine can avoid scanning data.**

---

# 7. The DayMonthQuarterYear Pattern

Daily row groups solve the hot-data problem, but keeping the entire history as daily row groups is unnecessarily fine-grained.

A query-oriented layout can use progressively larger periods:

```text
RG → today
RG → yesterday

RG → previous 30 days
RG → previous 30 days

RG → previous 90 days
RG → previous 90 days
RG → previous 90 days
RG → previous 90 days
RG → previous 90 days

RG → previous 360 days
RG → previous 360 days
...
```

Approximately:

```text
Day | Day | Month | Month | Q | Q | Q | Q | Q | Year | Year | ...
```

This is the **DayMonthQuarterYear pattern**.

| Dashboard query             | One RG for 3 years | DayMonthQuarterYear | Approx. scan reduction |
| --------------------------- | -----------------: | ------------------: | ---------------------: |
| Today                       |            3 years |               1 day |            **~1,095×** |
| Today vs yesterday          |            3 years |              2 days |              **~548×** |
| Current month               |            3 years |             1 month |               **~36×** |
| Month vs previous month     |            3 years |            2 months |               **~18×** |
| Current quarter             |            3 years |           1 quarter |               **~12×** |
| Quarter vs previous quarter |            3 years |          2 quarters |                **~6×** |
| One historical year         |            3 years |              1 year |                **~3×** |

The layout changes every day, so we maintain it using two layers.

The first is an immutable daily base:

```text
daily/
    2026-08-24.parquet
    2026-08-25.parquet
    2026-08-26.parquet
    2026-08-27.parquet
    ...
```

The second is a query-optimized Parquet layout built incrementally from that base:

```text
stable daily data
       ↓
incremental ETL
       ↓
Day | Day | Month | Month | Q | Q | Q | Q | Q | Year | ...
       ↓
fast scans
```

As data ages:

```text
Day → Month → Quarter → Year
```

Most historical row groups remain unchanged and can be reused.

> **Store the data at a stable daily grain, then incrementally build the Parquet row-group layout that best matches how users query it today.**

---

## Part III — Parquet on Object Storage

# 8. Object Storage Changes the Storage Model

The original Parquet recommendations were strongly influenced by **HDFS and large sequential disk reads**.

```text
Compute
   ↑
HDFS
   ↑
attached disks
```

Modern cloud analytics often uses:

```text
       Parquet
          │
          ↓
   Object Storage
      S3 / GCS
          │
    ┌─────┼─────┐
    ↓     ↓     ↓
 Lambda DuckDB Trino
```

The storage is independent of the compute.

The Parquet files can remain permanently in object storage while compute is started only when needed.

Assume a small HDFS cluster using inexpensive cloud machines and disks, approximately 3× replication, and relatively few queries.

Using intentionally rounded numbers:

| Data stored |      Object storage | Small HDFS cluster |
| ----------- | ------------------: | -----------------: |
| **1 MB**    | **~$0.00002/month** |    **~$100/month** |
| **1 TB**    |      **~$25/month** |    **~$350/month** |

HDFS has a significant fixed cost because storage lives on running DataNodes.

Object storage is closer to paying for bytes stored independently of compute.

The next question is:

> **If the Parquet file is remote, how much of it actually needs to cross the network?**

---

# 9. Column Size Matters

Our coffee table is already aggregated.

Each row represents:

> **one minute × one branch × one product**

For example:

```jsonl
{"minute":"08:13","branch":"B17","product":"Latte","quantity":17,"employee_ids":["E42","E19"],"customer_ids":["C839201","C104833","C550182"]}
{"minute":"08:13","branch":"B17","product":"Espresso","quantity":8,"employee_ids":["E42"],"customer_ids":["C772192","C441927"]}
```

These fields behave very differently:

```text
product
    → hundreds of possible values
    → repeats heavily

employee_ids[]
    → thousands of possible values
    → some repetition

customer_ids[]
    → millions of possible values
    → high cardinality
```

Parquet stores these as separate columnar leaf streams. The details of repeated arrays are covered in Appendix A.

The important result is that their **compressed sizes can be very different**.

```text
             SAME LOGICAL DATASET

product       █
quantity      █
employee_ids  █████
customer_ids  ███████████████████
```

The bars are conceptual, not measured sizes.

For:

```sql
SELECT
    product,
    SUM(quantity)
FROM coffee_sales
GROUP BY product;
```

the reader needs:

```text
product       → READ
quantity      → READ

employee_ids  → SKIP
customer_ids  → SKIP
```

Even if `customer_ids` is the largest column in the file, zero customer-ID data needs to cross the network for this query.

So when Parquet lives in S3 or GCS, the important quantity is:

```text
bytes fetched
     =
footer / metadata
     +
compressed size of needed columns
inside needed row groups
```

not the complete row-group size.

```text
                    PARQUET
                       │
            ┌──────────┴──────────┐
            ↓                     ↓
         ROW GROUPS             COLUMNS
            │                     │
       Which rows?           Which fields?
            │                     │
            └──────────┬──────────┘
                       ↓
              bytes over network
```

> **For object-store Parquet, we care about the size of the columns the query actually needs—not the size of the complete row group.**

---

# 10. What We Learned

| Chapter | Chapter name                                   | What we learned                                                                                                                                           |
| ------: | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   **1** | **From Coffee Sales to Business Questions**    | Coffee can make business.                                                                                                                                 |
|   **2** | **Fast Queries Start by Reading Less**         | Avoiding the irrelevant data is the key.                                                                                                                  |
|   **3** | **Why Columnar Storage Is Fast**               | Binary representation and compression.                                                                                                                    |
|   **4** | **The Cost of Scanning Too Much**              | Avoiding irrelevant rows is the key.                                                                                                                      |
|   **5** | **Partitioning the Data by Time**              | Make useful parts of the data independently skippable.                                                                                                    |
|   **6** | **How Parquet Knows Which Row Groups to Skip** | Footer min/max statistics make row-group skipping possible.                                                                                               |
|   **7** | **The DayMonthQuarterYear Pattern**            | One useful example of designing row-group boundaries around query patterns.                                                                               |
|   **8** | **Object Storage Changes the Storage Model**   | S3/GCS + Parquet separate cheap persistent storage from temporary compute. Remote data transfer becomes important.                                        |
|   **9** | **Column Size Matters**                        | We can fetch specific columns from object storage; there is no need to fetch the complete row group. Physical Parquet layout therefore matters even more. |

> **The important question is not how quickly we can scan our Parquet file. It is how we can structure the file so that most of it never needs to be scanned.**

---

# References

1. **Amazon Athena Documentation**
   `https://docs.aws.amazon.com/athena/`
   A direct industry example of the architecture discussed in Part III: Athena is serverless and queries data directly in S3 using SQL, without requiring a persistent query cluster.

2. **Apache Parquet — Nested Encoding**
   `https://parquet.apache.org/docs/file-format/nestedencoding/`
   Explains Parquet's Dremel-based representation of repeated and optional nested values using repetition and definition levels.

3. **DuckDB — Parquet Overview**
   `https://duckdb.org/docs/stable/data/parquet/overview`
   Practical example of an analytical engine reading and writing Parquet and pushing projections and filters into the Parquet scan.

4. **DuckDB — Parquet Tips**
   `https://duckdb.org/docs/stable/data/parquet/tips`
   Discusses row groups, parallelism, sorting, and using Parquet statistics for row-group pruning.

---

# Appendix A — How Parquet Stores Repeated Values

Consider three logical rows:

```jsonl id="z8u7va"
{"product":"Latte","quantity":17,"employee_ids":["E42","E19"]}
{"product":"Espresso","quantity":8,"employee_ids":["E42"]}
{"product":"Latte","quantity":12,"employee_ids":["E42","E19"]}
```

Conceptually:

```text id="v2vv82"
employee_ids

E42 | E19 || E42 || E42 | E19
          ↑      ↑
       new row  new row
```

Parquet does not literally store `|` and `||` characters. It stores compact **repetition levels** alongside the values.
