# Why Parquet Structure Matters for Fast Queries

*By Shai Ben-Yehuda*

☕ This is the long version. Take your coffee and follow the bytes from business questions to Parquet's physical structure.

## Part I — Why Columnar Storage Is Fast

## 1. A Coffee Business with 3 Years of Data

Imagine a coffee-shop network similar to Starbucks.

The network records about **100,000 sales transactions per day**. Each transaction produces one row describing what was sold, where it was sold,
when it happened, and for how much.

Over roughly 1,000 days, or three years, this produces about **100 million rows**. With roughly **500 columns per row**, the dataset contains about
**50 billion values**. At an average of **2 compressed bytes per value**, the Parquet dataset occupies about **100 GB**, or approximately **100 MB per day**.

Among the roughly 500 fields are:

```csv
timestamp,branch_id,city,product,...,quantity,unit_price,...,customer_id,...
2026-07-14 08:13:21,BR017,London,Latte,...,2,5.20,...,C839201,...
2026-07-14 08:14:03,BR042,Manchester,Espresso,...,1,2.80,...,C104833,...
2026-07-14 08:14:18,BR017,London,Cold Brew,...,1,4.90,...,C550182,...
```

The interesting question is not how to store this data.

The interesting question is:

> **How do we search through it quickly enough to turn it into useful business information?**

---

## 2. What the Business Wants to Know

A manager does not want to look at transaction rows.

They want a dashboard.

### Coffee Network — July Dashboard

| Metric | Value |
| --- | ---: |
| Sales last month | $18.2M |
| Morning sales | $7.8M |
| Evening sales | $4.1M |
| Best-selling flavor | Vanilla |
| Best-selling product | Latte |

Behind each number is a query.

For example, monthly revenue:

```sql
SELECT
    SUM(quantity * unit_price) AS revenue
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp <  '2026-08-01';
```

Or sales by time of day:

```sql
SELECT
    CASE
        WHEN EXTRACT(hour FROM timestamp) < 12 THEN 'morning'
        WHEN EXTRACT(hour FROM timestamp) < 18 THEN 'afternoon'
        ELSE 'evening'
    END AS period,
    SUM(quantity * unit_price) AS revenue
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp <  '2026-08-01'
GROUP BY period;
```

And the most popular flavor:

```sql
SELECT
    flavor,
    SUM(quantity) AS cups
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp <  '2026-08-01'
GROUP BY flavor
ORDER BY cups DESC
LIMIT 1;
```

These queries look simple.

But underneath them is the main subject of this paper:

> **What data does the computer actually have to read in order to answer the query?**

---

# 3. Scan Less, Query Faster

Consider the monthly revenue query again:

```sql
SELECT
    SUM(quantity * unit_price)
FROM sales
WHERE timestamp >= '2026-07-01'
  AND timestamp <  '2026-08-01';
```

Our dataset has roughly 500 columns, but this query needs only three:

```text
timestamp
quantity
unit_price
```

The remaining roughly 497 columns are irrelevant. They include:

```text
branch_id
city
product
flavor
size
payment_type
customer_id
```

The query also needs only July's rows. At roughly 100,000 transactions per day, July contains about:

```text
31 days × 100,000 rows/day = 3.1 million rows
```

The smallest useful input is therefore:

```text
3.1 million rows × 3 columns = 9.3 million values
9.3 million values × 2 compressed bytes = 18.6 MB
```

So a normal projected scan needs about **18.6 MB**, plus Parquet metadata, from a **100 GB** dataset. Actual column sizes vary, but this gives us the
right scale.

Reaching this scan size requires both forms of pruning:

```text
row-group pruning → read only July's 3.1 million rows
column projection → read only timestamp, quantity, and unit_price
```

```text
                3 cols: 0.6%     497 cols: 99.4%
             ┌─────────────────┬─────────────────┐
July 3.1%    │ SCAN 18.6 MB    │ SKIP 3.08 GB    │
3.1M rows    │ 0.0186% ▏       │ 3.08%   ▌       │
             ├─────────────────┼─────────────────┤
Other 96.9%  │ SKIP 581.4 MB   │ SKIP 96.32 GB   │
96.9M rows   │ 0.5814% ▏       │ 96.32% ████████ │
             └─────────────────┴─────────────────┘

                 bar length = share of 100 GB
```

If the date is also encoded in partition metadata and every selected batch is wholly inside July, the engine can avoid scanning `timestamp` values too.
The absolute floor then becomes the two measure columns: about **12.4 MB**, plus metadata. Whether an engine reaches that floor depends on its query plan.

Without row-group pruning, the engine may scan the timestamp column across all 100 million rows merely to find July. Without column projection, it may
read July's values from all roughly 500 columns. The best physical layout allows it to do neither.

Now consider a wider query that compares two quarters using 15 columns:

```sql
SELECT
    DATE_TRUNC('quarter', timestamp) AS quarter,
    SUM(quantity * unit_price - discount_amount + tax_amount + shipping_amount - refund_amount) AS net_revenue,
    SUM(cost_amount + marketing_cost + payment_fee + labor_cost + packaging_cost + waste_cost + inventory_adjustment) AS operating_cost,
    SUM(loyalty_points) AS loyalty_points
FROM sales
WHERE timestamp >= '2026-01-01'
  AND timestamp <  '2026-07-01'
GROUP BY quarter;
```

The query covers about 180 days and references 15 columns:

```text
180 days × 100,000 rows/day = 18 million rows
18 million rows × 15 columns = 270 million values
270 million values × 2 compressed bytes = 540 MB
```

This query scans about **18% of the rows** and **3% of the columns**. Their intersection is about **0.54% of the dataset**, or **540 MB**, plus metadata.


This gives us the first important principle:

> **Query performance is often less about processing data faster and more about reading less data in the first place.**



# 4. Scanning Implementation Tiers

| Tier                            | Architecture                                           | Typical use                           | Data / cache            | Strategy                                                                                                             |                      Approx. price / call |          100 q/day |      1K q/day |      10K q/day |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------: | -----------------: | ------------: | -------------: |
| **1 — Stateless Lambda**        | Router → Lambda → S3 Range GET → `/tmp` → Parquet scan | Small selective queries               | **≤100 MB scan**        | Fetch only required Parquet ranges; `/tmp` is opportunistic cache; Lambda disappears when idle                       |                      **~$0.00002** | **~0.20/mo** |  **~$2/mo** | **~$20/mo** |
| **2 — Get-or-create ECS**       | Router → ECS → local EBS cache → S3                    | Sporadic/repeated queries             | **~1 GB cache**         | ~2 min cold start; keep warm while expected query gap <~2 min; otherwise destroy and recreate before predicted query | **Warm ~$0.00005/sec**; **cold ~$0.007** |        **~$20/mo** |   **~$50/mo** |    **~$50/mo** |
| **3a — Full replicated data**   | Always-on HDFS / replicated storage cluster            | Constant/high query load              | **100 GB full dataset** | Keep full dataset continuously available; typically 3× replication                                                   |                                         — |      **~$250+/mo** | **~$250+/mo** |  **~$250+/mo** |
| **3b — Full replicated data**   | Always-on HDFS / replicated storage cluster            | Constant/high query load              | **1 TB full dataset**   | Keep full dataset continuously available; typically 3× replication                                                   |                                         — |      **~$500+/mo** | **~$500+/mo** |  **~$500+/mo** |
| **3c — 100-node Trino cluster** | 100 always-on Trino/HDFS nodes                         | Large organization / high concurrency | **1 TB full dataset**   | 100 workers always warm; ~3 TB physical storage with 3× replication                                                  |                                         — |      **~$7K/mo** | **~$7K/mo** |  **~$7K/mo** |
| **3d — 100-node Trino cluster** | 100 always-on Trino/HDFS nodes                         | Very large analytical platform        | **1 PB full dataset**   | 100 workers always warm; ~3 PB physical storage with 3× replication                                                  |                                         — |      **>$50K/mo** | **>$50K/mo** |  **>$50K/mo** |



# 9. Partitioning the Data by Time

A straightforward solution is to physically divide the dataset by time.

One way is to create separate Parquet files:

``` text
sales/
    2026-08-24.parquet
    2026-08-25.parquet
    2026-08-26.parquet
    2026-08-27.parquet
```

Now a query for yesterday can read exactly one day's file.

Our rounded model gives the physical scale of these time units:

``` text
day       ~100 MB
month       ~3 GB
quarter     ~9 GB
year       ~36 GB
3 years   ~100 GB
```

But a partition does **not have to be a separate file**.

Parquet already contains an internal partition-like structure: the **row
group**.

We could instead keep one Parquet file:

``` text
sales.parquet
```

and arrange it internally as:

``` text
sales.parquet

Row Group 1 → 2026-08-24
Row Group 2 → 2026-08-25
Row Group 3 → 2026-08-26
Row Group 4 → 2026-08-27
...
```

From the point of view of the query, the important property is not
necessarily:

> one day = one file

but rather:

> **one day = one independently skippable physical batch**

That batch may be a file, or it may be a row group inside a larger
Parquet file.

For three years of data, the difference in scanned data can still be
dramatic.

  Query         One undivided 3-year scan   Daily batches
  ----------- --------------------------- ---------------
  One day                      1,000 days           1 day
  One week                     1,000 days          7 days
  One month                    1,000 days       \~30 days
  One year                     1,000 days        365 days

Ignoring fixed overhead, this suggests approximate reductions in data
scanned of:

``` text
1 day   → ~1,000×
1 week  → ~143×
1 month → ~33×
1 year  → ~3×
```

So the first important structural decision is the **size of the
independently skippable batch**.

Too large, and short queries scan too much.

Too small, and long queries must deal with many small pieces.

------------------------------------------------------------------------

# 10. How Parquet Knows Which Row Groups to Skip

This raises an obvious question.

If yesterday is only one row group inside a large Parquet file, how can
the query engine find it without first scanning all the row groups?

The answer is the **Parquet footer**.

A Parquet file is roughly structured like this:

``` text
┌─────────────────────────────────────┐
│ Row Group 1                         │
│   timestamp column chunk            │
│   branch_id column chunk            │
│   quantity column chunk             │
│   unit_price column chunk           │
│   ...                               │
├─────────────────────────────────────┤
│ Row Group 2                         │
│   timestamp column chunk            │
│   branch_id column chunk            │
│   quantity column chunk             │
│   unit_price column chunk           │
│   ...                               │
├─────────────────────────────────────┤
│ Row Group 3                         │
│   ...                               │
├─────────────────────────────────────┤
│ Footer                              │
├─────────────────────────────────────┤
│ Footer length                       │
│ PAR1                                │
└─────────────────────────────────────┘
```

The footer is stored at the **end of the file**.

It contains metadata describing the physical structure of the file.

Among other things, it tells the reader:

-   how many row groups exist,
-   how many rows each row group contains,
-   which columns exist,
-   where each column chunk is physically located in the file,
-   how large each chunk is,
-   which compression and encoding are used,
-   and statistics about the values stored in many column chunks.

## The Footer Has a Cost

Smaller row groups make skipping more precise, but every row group adds metadata for each column chunk.
That metadata includes locations, sizes, encodings, and often statistics such as minimum and maximum values.
The footer therefore grows with both the number of row groups and the number of columns.

This creates a fixed query-startup cost.
Before scanning useful data, the engine must fetch the footer from the end of the file, decode it, and decide which row groups and columns may match.
A larger footer means more metadata bytes, more planning work, and potentially another range request if the first footer read is not large enough.

There is also an execution cost when row groups are too small.
Even after pruning, the selected data may be fragmented across many column chunks, producing more bookkeeping and more object-storage range requests.
This is separate from footer size: the footer affects query startup, while fragmented reads affect the scan itself.

Row-group sizing is therefore a balance:

``` text
smaller row groups → finer skipping, more metadata, more fragments
larger row groups  → less metadata, fewer fragments, coarser skipping
```

The right size depends on the query pattern.
Fine row groups are valuable when filters exclude most of the data; larger row groups can be better when queries usually scan broad ranges.

For our timestamp column, the metadata may conceptually say:

``` text
Row Group 1
    timestamp
    min = 2026-08-24 00:00
    max = 2026-08-24 23:59

Row Group 2
    timestamp
    min = 2026-08-25 00:00
    max = 2026-08-25 23:59

Row Group 3
    timestamp
    min = 2026-08-26 00:00
    max = 2026-08-26 23:59

Row Group 4
    timestamp
    min = 2026-08-27 00:00
    max = 2026-08-27 23:59
```

Now consider:

``` sql
WHERE timestamp >= '2026-08-26'
  AND timestamp <  '2026-08-27'
```

The query engine can first read the relatively small footer.

It can then reason:

``` text
RG 1 max = Aug 24  → impossible → skip
RG 2 max = Aug 25  → impossible → skip
RG 3 Aug 26         → possible   → read
RG 4 min = Aug 27   → impossible → skip
```

So the physical access becomes:

``` text
read footer
     ↓
inspect row-group metadata
     ↓
choose Row Group 3
     ↓
read only the required columns
     ↓
timestamp + quantity + unit_price
```

The engine does **not** need to read the sales values from Row Groups 1,
2, and 4 merely to discover that they do not match.

This is one of the most important ideas in Parquet.

> **The footer lets the engine reason about data before reading the data
> itself.**

And because the footer also records the physical byte locations of
column chunks, a reader working against S3, GCS, or a local file can
request only the relevant byte ranges.

Conceptually:

``` text
Parquet file in object storage

0 GB                                             100 GB
│--------------------------------------------------│
      RG1          RG2          RG3          RG4      Footer
                                ↑
                                │
                         query needs this

First request:
                                                └─ footer

Second request:
                                └─ required column chunks
```

This is why the organization of values across row groups matters so
much.

If timestamps are distributed randomly across all row groups:

``` text
RG 1: 2024 ... 2026
RG 2: 2024 ... 2026
RG 3: 2024 ... 2026
RG 4: 2024 ... 2026
```

then every row group's timestamp range may overlap yesterday.

The footer tells us:

``` text
RG 1 → maybe
RG 2 → maybe
RG 3 → maybe
RG 4 → maybe
```

and almost nothing can be skipped.

If the data is arranged so that row groups have narrow time ranges:

``` text
RG 1 → Aug 24
RG 2 → Aug 25
RG 3 → Aug 26
RG 4 → Aug 27
```

the exact same Parquet metadata suddenly becomes extremely powerful.

The footer does not create the organization.

It **describes the organization we created**, allowing the query engine
to exploit it.

------------------------------------------------------------------------

# 11. The DayMonthQuarterYear Pattern

The ideal physical unit depends on the query.

For:

``` text
today
```

we would like a daily unit.

For:

``` text
last month
```

we would like something closer to a monthly unit.

For:

``` text
last year
```

we would prefer much larger units.

This suggests that there may not be one universally correct partition
size.

Instead, we can build the storage around the time ranges people actually
query.

For example, for today's view of history:

``` text
Recent:
    2 × Month

Medium-term:
    5 × Quarter

Older:
    N × Year
```

Conceptually:

``` text
| Month | Month | Quarter | Quarter | Quarter | Quarter | Quarter | Year | Year | ... |
|------- recent -------|------------- older ------------------------------|
```

Now a query for recent data touches relatively fine-grained batches,
while a query over several years can use large yearly batches instead of
hundreds of daily ones.

The interesting property is that these ranges **do not overlap**.

Together they form one representation of the entire history.

------------------------------------------------------------------------

# 12. The Layout Depends on Today

There is an unusual consequence.

The optimal layout is different every day.

Suppose today is August 27.

We may want:

``` text
August
July

Q2
Q1
Q4
Q3
Q2

2024
2023
...
```

As time moves forward, the boundaries move.

Eventually a recent month becomes part of a completed quarter.

Several quarters eventually become a year.

So our physical representation is not static.

Data gradually moves through levels:

``` text
Day
 ↓
Month
 ↓
Quarter
 ↓
Year
```

This sounds expensive if interpreted as:

> Every day, rebuild three years of data.

But that is not necessary.

The transformation can be incremental.

------------------------------------------------------------------------

# 13. Two Layers of Data

We can separate the problem into two layers.

### Base layer: daily data

The fundamental immutable data is stored by day:

``` text
daily/
    2026-08-24.parquet
    2026-08-25.parquet
    2026-08-26.parquet
    2026-08-27.parquet
    ...
```

Each completed day becomes a stable building block.

This layer is simple.

We never need to continuously reorganize the original history.

### Query layer: today's optimized layout

From the daily layer we build the physical files that are useful for
queries **today**:

``` text
query-layout/
    month-current.parquet
    month-previous.parquet

    quarter-1.parquet
    quarter-2.parquet
    quarter-3.parquet
    quarter-4.parquet
    quarter-5.parquet

    year-2024.parquet
    year-2023.parquet
    ...
```

The query layer is therefore a materialized representation of the daily
base layer.

``` text
                    Daily base
                        │
        ┌───────────────┼────────────────┐
        ↓               ↓                ↓
      days           months          quarters
                                         │
                                         ↓
                                       years

                        │
                        ↓

              Today's query layout

          2 × Month + 5 × Quarter + N × Year
```

------------------------------------------------------------------------

# 14. Building Tomorrow from Today

The important point is that most of this structure does not change every
day.

When a new day arrives:

``` text
2026-08-28.parquet
```

we do not rebuild the historical years.

We only update the part of the hierarchy affected by the new day.

During a normal day inside a month:

``` text
new day
   ↓
current month
```

At a month boundary:

``` text
completed month
      ↓
may become part of a quarter
```

At a quarter boundary:

``` text
completed quarter
       ↓
may replace several smaller units
```

And at a year boundary:

``` text
completed quarters
       ↓
completed year
```

The old daily files remain the source of truth.

The larger Parquet files are derived structures optimized for scanning.

This gives us an **incremental ETL** model:

``` text
events
   ↓
daily Parquet
   ↓
incremental build
   ↓
2 × Month + 5 × Quarter + N × Year
   ↓
fast analytical scans
```

Instead of asking for one permanent partitioning scheme, we maintain a
hierarchy whose physical structure follows the way the data is actually
queried.

The daily layer gives us a stable foundation.

The second layer gives us a query-optimized view of history.

And because the second layer can always be reconstructed from the daily
layer, we are free to change its structure as query patterns change.
## Part III — Parquet on Object Storage

# 13. Object Storage Changes the Storage Model

The original Parquet recommendations were strongly influenced by **HDFS
and large sequential disk reads**.

``` text
Compute
   ↑
HDFS
   ↑
attached disks
```

Modern cloud analytics often uses a different architecture:

``` text
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

The storage is independent of the compute. Parquet files can remain
permanently in **Amazon S3**, **Google Cloud Storage**, or another
object store while compute is started only when needed.

## The Cost Difference

Assume a small HDFS cluster using inexpensive cloud machines and disks,
approximately 3× replication, and relatively few queries. Using
intentionally rounded numbers:

  Data stored            Object storage   Small HDFS cluster
  ------------- ----------------------- --------------------
  **100 GB**          **\~\$2.50/month**    **\~\$100/month**
  **1 TB**             **\~\$25/month**    **\~\$350/month**

HDFS has a significant fixed cost because storage lives on running
DataNodes. Object storage is closer to paying for bytes stored
independently of compute.

> **The compute does not have to stay alive with the data.**

The same persistent Parquet data can be accessed by temporary compute:

``` text
                    S3 / GCS
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       Lambda        DuckDB        Trino
```

Amazon Athena is a particularly direct example: serverless SQL over data
stored in S3.

The next question is:

> **If our Parquet file is remote, how much of it actually needs to
> cross the network?**

------------------------------------------------------------------------

# 14. Column Size Matters

To examine nested columns, consider a separate table derived from the transaction data. Unlike the original transaction table, each row here represents:

> **one minute × one branch × one product**

``` jsonl
{"minute":"08:13","branch":"B17","product":"Latte","quantity":17,"employee_ids":["E42","E19"],"customer_ids":["C839201","C104833","C550182"]}
{"minute":"08:13","branch":"B17","product":"Espresso","quantity":8,"employee_ids":["E42"],"customer_ids":["C772192","C441927"]}
{"minute":"08:14","branch":"B17","product":"Latte","quantity":12,"employee_ids":["E42","E19"],"customer_ids":["C928441","C038292"]}
```

The fields can have very different cardinalities:

``` text
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

Parquet stores these as separate columnar leaf streams. The details of
repeated arrays are covered in Appendix A.

The important result is that their **compressed physical sizes can be
very different**.

``` text
             SAME LOGICAL DATASET

product       █
quantity      █
employee_ids  █████
customer_ids  ███████████████████
```

The bars are illustrative, not measured sizes.

For:

``` sql
SELECT product, SUM(quantity)
FROM coffee_sales
GROUP BY product;
```

the reader needs:

``` text
product       → READ
quantity      → READ
employee_ids  → SKIP
customer_ids  → SKIP
```

Even if `customer_ids` is the largest column, zero customer-ID data
needs to cross the network.

A selected row group does **not** imply fetching the entire row group.
Its column chunks can be fetched independently.

``` text
bytes fetched
     =
footer / metadata
     +
compressed size of needed columns
inside needed row groups
```

``` text
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

> **For object-store Parquet, we care about the size of the columns the
> query actually needs---not the size of the complete row group.**

------------------------------------------------------------------------

# 15. What We Learned

  ------------------------------------------------------------------------
                       Chapter Chapter name          What we learned
  ---------------------------- --------------------- ---------------------
                         **1** **A Coffee Business   Start with a concrete
                               with 3 Years of       analytical dataset
                               Data**                and ask how we search
                                                     it efficiently.

                         **2** **What the Business   Dashboards translate
                               Wants to Know**       raw data into
                                                     recurring analytical
                                                     queries.

                         **3** **Scan Less, Query    Query optimization
                               Faster**              starts by avoiding
                                                     irrelevant data.

                         **4** **Scanning            The same Parquet data
                               Implementation        can be scanned by
                               Layouts**              local, distributed,
                                                     managed, or cached
                                                     compute.

                         **5** **From Rows to        Columnar storage lets
                               Columns**             a query avoid unused
                                                     fields.

                         **6** **We Do Not Need to   Typed binary
                               Store Text Either**   representations are
                                                     compact and
                                                     CPU-friendly.

                         **7** **Columns Also        Similar values
                               Compress Extremely    together improve
                               Well**                encoding and
                                                     compression.

                         **8** **The Cost of         Most queries may
                               Scanning Too Much**   target a tiny hot
                                                     fraction of history.

                         **9** **Partitioning the    Row groups create
                               Data by Time**        independently
                                                     skippable physical
                                                     batches.

                        **10** **How Parquet Knows   Footer statistics
                               Which Row Groups to   allow irrelevant row
                               Skip**                groups to be
                                                     rejected.

                        **11** **The                 Row-group boundaries
                               DayMonthQuarterYear   can follow real query
                               Pattern**             patterns.

                        **12** **Maintaining a       A daily base plus
                               Changing Layout**     incremental ETL can
                                                     maintain the
                                                     optimized layout.

                        **13** **Object Storage      S3/GCS separate cheap
                               Changes the Storage   persistent storage
                               Model**               from temporary
                                                     compute.

                        **14** **Column Size         Selecting a row group
                               Matters**             does not mean
                                                     fetching all of its
                                                     columns.
  ------------------------------------------------------------------------

> **The important question is not how quickly we can scan our Parquet
> file. It is how we can structure the file so that most of it never
> needs to be scanned.**

------------------------------------------------------------------------

# Appendix A --- How Parquet Stores Repeated Values

Consider three logical rows:

``` jsonl
{"product":"Latte","quantity":17,"employee_ids":["E42","E19"]}
{"product":"Espresso","quantity":8,"employee_ids":["E42"]}
{"product":"Latte","quantity":12,"employee_ids":["E42","E19"]}
```

For scalar columns, there is one value per logical row:

``` text
product
Latte | Espresso | Latte

quantity
17 | 8 | 12
```

But `employee_ids` contains multiple values per logical row:

``` text
[E42, E19]
[E42]
[E42, E19]
```

Parquet still stores these values as one columnar stream.

Conceptually:

``` text
employee_ids

E42 | E19 || E42 || E42 | E19
          ↑      ↑
       new row  new row
```

Here:

``` text
|   → another value in the same repeated field
||  → the repeated field of the next logical row
```

Parquet does **not** literally store `|` and `||` characters. It stores
compact **repetition levels** alongside the values.

``` text
value    repetition
E42          0
E19          1
E42          0
E42          0
E19          1
```

Very roughly:

``` text
repetition = 0 → start the repeated field of a new logical row
repetition = 1 → another value belonging to the same repeated field
```

This is derived from Google's **Dremel** representation of nested data.

Parquet also stores **definition levels** for optional nested
structures. They distinguish cases such as:

``` jsonl
{"product":"Latte","employee_ids":["E42","E19"]}
{"product":"Espresso","employee_ids":[]}
{"product":"Latte"}
```

That is:

``` text
values exist       → ["E42","E19"]
empty list exists  → []
field is absent    → missing
```

So:

``` text
repetition levels → where repeated groups start
definition levels → which optional nested values exist
```

Together they allow Parquet to represent nested logical objects as flat
columnar value streams without storing arrays as JSON strings or
duplicating the complete parent record for every child value.

For the coffee aggregate:

``` text
minute
branch
product
quantity
employee_ids[]
customer_ids[]
```

Parquet can maintain separate leaf streams:

``` text
minute
08:13 | 08:13 | 08:14 | ...

product
Latte | Espresso | Latte | ...

quantity
17 | 8 | 12 | ...

employee_ids
E42 | E19 | E42 | E42 | E19 | ...

customer_ids
C839201 | C104833 | C550182 | ...
```

The scalar aggregate values remain scalar, the repeated dimensions
remain repeated, and each leaf remains independently encoded,
compressed, and skippable.

------------------------------------------------------------------------

# Appendix B --- Implementation Layout Benchmarks

Implementation-layout comparisons need more than a dataset size and a runtime. A useful benchmark records the engine, storage, physical input,
query shape, output, hardware, cache state, and whether the reported size means total dataset size or bytes actually scanned.

The stable row IDs below let the main text cite a specific measurement without turning an interpolation into a measured fact.

| ID | Engine and storage | Benchmark data | Workload | Measured time | Environment and cache | What it supports |
| --- | --- | --- | --- | ---: | --- | --- |
| T-S3-1 | Trino 482, S3 Parquet | TPC-H SF1; approximately 1 GB dataset | All 22 TPC-H queries | 10.65 s total | Coordinator plus 3 workers on 4 c7i.2xlarge nodes; 5 trials after 2 warmups | Small Trino/S3 queries averaged below 0.5 s in this suite; dataset size is not bytes scanned per query. |
| T-S3-100 | Trino 482, S3 Parquet | TPC-H SF100; approximately 100 GB dataset | All 22 TPC-H queries | 497 s total | Coordinator plus 3 workers on 4 c7i.4xlarge nodes; 5 trials after 2 warmups | About 22.6 s per query on this topology; individual queries scan different subsets and perform different work. |
| D-LOCAL-1 | DuckDB, local Parquet | TPC-H SF1; approximately 1 GB dataset | Individual TPC-H queries | 9.8--143 ms | Apple M4 Max; process isolation, thermal gating, repeated medians and warmups | Direct evidence for subsecond local queries at SF1. |
| D-LOCAL-100 | DuckDB, local Parquet | TPC-H SF100; approximately 100 GB dataset | Individual TPC-H queries | 246 ms--5.03 s | Apple M4 Max; out-of-core dataset; same strict protocol as D-LOCAL-1 | Large dataset does not imply a full-dataset scan; query projections and predicates still determine physical input. |
| T-HDFS-100 | Trino 419, Hive ORC on HDFS | TPC-H SF100; approximately 100 GB dataset | Individual TPC-H queries | 2.09--21.76 s | Coordinator plus 3 workers; four 16-core hosts; 5 Gbit/s network; 1 warmup and average of 3 runs | Direct large-scale HDFS envelope for this cluster, file format, and query suite. |
| T-CACHE | Trino with Alluxio filesystem cache | TPC queries and production workloads | Mixed analytical workload | Approximately 20% faster overall; analysis phase 30% faster | Dune production and benchmark report; warm-cache comparison; 70% fewer S3 GET requests | A relative cache factor, not an absolute latency for 100 MB, 1 GB, or 100 GB. |
| A-73M | Athena, S3 Parquet | 72.94 MB physically scanned | Filtered `COUNT(*)` | 0.82 s | Bucketed table; AWS benchmark | Direct small-scan evidence; contradicts any universal 3-second Athena floor. |
| A-69M | Athena, S3 Parquet | 69.1 MB physically scanned | Filtered projection returning 2.21 million rows | 7.82 s | Bucketed table; average of 10 runs | Similar scan size to A-73M but much more output and work, showing why scan size alone cannot predict latency. |
| A-359M | Athena, S3 Parquet | 358.6 MB physically scanned | Same projection as A-69M, non-bucketed | 10.95 s | Non-bucketed table; average of 10 runs | Isolates part of the effect of bucketing while retaining the query and output. |
| A-2G | Athena, S3 Parquet | 2.29 GB physically scanned | Filtered `COUNT(*)` | 1.3 s | Non-bucketed table; AWS benchmark | Near-scale evidence for a simple 1 GB-class query. |
| A-2G-B | Athena, S3 Parquet | 2.51 GB physically scanned from a 130 GB dataset | Log aggregation | 6.78 s | AWS benchmark | Another 1 GB-class anchor with different computation and data layout. |
| A-68G | Athena, S3 | 68.1 GB physically scanned | Join and `AVG` aggregation | 106 s | Missing a partition predicate on one joined table | Near-100 GB evidence for a join; not a pure scan-throughput measurement. |
| A-207G | Athena, S3 | 206.64 GB physically scanned | Filtered NOAA projection | 29.18 s | Original remote dataset | A larger scan finishing faster than A-68G proves that query and layout dominate a bytes-only model. |

## Benchmark Sources

| Source | Benchmark rows | Details |
| --- | --- | --- |
| [Ematix-flow TPC-H cloud benchmarks](https://ematix.dev/reference/benchmarks/) | T-S3-1, T-S3-100, D-LOCAL-1, D-LOCAL-100 | Same Parquet data within each track; per-query validation; raw provenance; repeated trials and warmups. |
| [StarRocks TPC-H comparison](https://docs.starrocks.io/docs/benchmarking/TPC-H_Benchmarking/) | T-HDFS-100 | Publishes all 22 Trino runtimes, cluster hardware, HDFS/Hive ORC layout, warmup, and averaging procedure. |
| [Trino and Alluxio benchmark report](https://www.alluxio.io/blog/trino-and-alluxio-better-together) | T-CACHE | Reports relative TPC and production improvements from Trino filesystem caching at Dune. |
| [AWS Athena performance tuning](https://aws.amazon.com/blogs/big-data/top-10-performance-tuning-tips-for-amazon-athena/) | A-73M, A-2G, A-68G | Publishes query SQL, physical data scanned, runtime, and layout changes. |
| [AWS Athena bucketing benchmark](https://aws.amazon.com/blogs/big-data/optimize-data-layout-by-bucketing-with-amazon-athena-and-aws-glue-to-accelerate-downstream-queries/) | A-69M, A-359M, A-207G | Ten-run averages with query, scanned bytes, formats, file counts, and table layouts. |
| [AWS Athena S3 analysis](https://aws.amazon.com/blogs/big-data/analyzing-data-in-s3-using-amazon-athena/) | A-2G-B | Compares text and Parquet versions and reports dataset size, physical scan, runtime, and cost. |

## How to Use These Rows

A benchmark row is evidence for its complete configuration, not a universal product speed. Interpolation is strongest when engine, storage, query,
physical input, output size, file layout, hardware, and cache state remain comparable.

```text
dataset size       ≠ physical bytes scanned
physical scan time ≠ complete query latency
suite total        ≠ one query scanning the complete dataset
warm cache         ≠ cold object-storage access
```

For example, D-S3-X can anchor a transfer model for comparable S3 Express hardware. T-CACHE can provide a relative cache improvement. Neither justifies
combining the two numbers unless the underlying workload and deployment are first shown to be comparable.
