# Cube Studio PRD

## Purpose
Cube Studio lets Comax analysts and implementation teams understand, edit, validate, deploy, and monitor BI cubes without needing to read JavaScript first. The studio shows the cube as a visual data pipeline: ERP tables emit CDC events, CDC events reduce into silver rows, silver rows expose dimensions and metrics, and the cube powers reports.

## Target Users
- Business analysts who need to understand what each cube measures.
- ERP/data implementers who handle schema changes.
- AI-assisted support teams who update cube definitions after source changes.
- Data engineers who monitor pipeline health and deployment readiness.

## Core Jobs
- See the actual cube definition visually, including source tables, event filters, picked fields, calculated fields, validations, dimensions, metrics, and parquet outputs.
- Toggle from visual mode to the underlying JavaScript for users who want exact implementation details.
- Explore current output rows and grouped metric results from real CDC data.
- Detect schema and data quality risk before deploy.
- Use an AI side panel to guide edits when source schema changes.
- Review deployment readiness and monitor the data pipeline the cube creates.

## Primary Workflow
1. Open a cube in Studio.
2. Review the visual cube map.
3. Inspect field mappings and validations.
4. Explore sample CDC events, silver rows, dimensions, and metric output.
5. If ERP schema changed, use the AI side panel to identify impacted mappings.
6. Edit the cube definition, preview results, and compare health checks.
7. Deploy the cube when readiness checks pass.
8. Monitor event volume, materialization, validations, and report-level metrics.

## Product Requirements
- Visual Cube Map: show the pipeline from ERP tables to CDC events to silver rows to cube outputs.
- Definition Explorer: expose each pick, event filter, calc, validation, metric, dimension, and projection in plain language.
- JavaScript Toggle: show the exact JS source for users who need precision.
- Explore Screen: show real sample output and grouped metric results from the selected period.
- Health Screen: show real event count, silver row count, table coverage, validation state, and schema risk.
- Deploy Screen: show deploy readiness based on health checks and changed definition state.
- Monitor Screen: show pipeline volume, freshness concept, validation pass status, and output coverage.
- AI Side Chat: provide a contextual assistant panel backed by the reactive LLM proxy, sending cube name, schema signals, mappings, health checks, and sample rows so schema-change questions get grounded answers.

## Non-Goals
- Editing source code in-browser in this first demo.
- Persisting deployments to production.
- Replacing the existing BI script/probe studio.

## Acceptance Criteria
- The first screen clearly communicates the actual cube without requiring JS.
- Users can toggle between visual definition and JS.
- The studio uses real Comax CDC-derived data for counts, sample rows, grouped metrics, and health indicators.
- Mobile has no horizontal overflow and keeps all core screens usable.
- Tests cover rendering and the underlying cube data materialization.
