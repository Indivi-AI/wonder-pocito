# Traveling-agent benchmark

This is a self-contained fictional benchmark for a Northstar Loom business trip to Tel Aviv. It combines ordinary company noise with a coherent
commercial arc and two cross-source questions. Keep `benchmark.json` out of the tested agent's context; it is the evaluator answer key.

## Contents

| Source | File | Rows | FLAPI package | Cubes |
|---|---|---:|---:|---|
| Company email | `datasets/emails.json` | 100 emails in 28 threads | 101 | Emails, Attachments |
| Employee Instagram | `datasets/instagram.json` | 10 posts | 102 | Posts, Comments |
| Offline places | `datasets/google-places.json` | 1,200 places | 103 | Places |
| Planned itinerary | `itinerary.md`, `datasets/itinerary.json` | 17 events | 104 | Events, Attendance |
| Shared background | `knowledge.md` | One dossier | Not exposed as a Flow package | N/A |

All four packages are registered in the existing FLAPI mock. They support text search, row limits, and source-specific filters through quick params.

## Offline data notes

`google-places.json` deliberately uses a Google-Places-shaped record layout for the marketplace exercise, but it is not a proprietary Google export.
It contains 15 curated benchmark venues and 1,185 OpenStreetMap-derived distractors under ODbL 1.0. Ratings on this fixture are deterministic synthetic
values, not live reviews. No API key is needed, and package execution makes no network request.

The ten local JPEGs live in `solutions/pocito/assets/traveling-test/`. Their Wikimedia Commons source pages, authors, and licenses are recorded in
`datasets/photo-sources.json`. Instagram captions, tags, comments, and object descriptions are fictional benchmark data layered over those city photos.

## Run tests

From `solutions/pocito/flapi-mock`:

```bash
npx tsx --test ../traveling-test/flow-packages.test.ts
```

The tests verify registration, package metadata, corpus counts, filters, dietary evidence, and the itinerary-to-Instagram phone-location join.

## Refresh the public-map distractors

The checked-in dump is complete and works offline. To rebuild it from a fresh Overpass response, save the response as
`/tmp/traveling-test-overpass.json`, then run:

```bash
node ../traveling-test/scripts/build-google-places.mjs \
  /tmp/traveling-test-overpass.json \
  ../traveling-test/datasets/google-places.json
```
