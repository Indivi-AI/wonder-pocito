# Versioned Doclets in Object Storage

## Design goal

Publish each TGP doclet family as immutable, reproducible releases while preserving category-based selection. A mutable `latest` pointer should allow
atomic promotion and rollback without changing published releases.

## Identity

A doclet ID is dot-separated:

```text
<name>[.<category>...]
```

The first segment is always the doclet name. Every remaining segment is a category.

```text
customerSummary              name: customerSummary, categories: []
customerSummary.finance      name: customerSummary, categories: [finance]
customerSummary.finance.he   name: customerSummary, categories: [finance, he]
```

The corresponding registered TGP component is `doclet<llm-guide><id>`. Its short ID supplies the doclet ID, its component metadata supplies the
description, and rendering the component supplies the Markdown content.

## WURL

```text
doclet://<id>?v=<version>
```

Examples:

```text
doclet://customerSummary
doclet://customerSummary.finance
doclet://customerSummary.finance?v=1.2.0
doclet://customerSummary?v=latest
```

`v` is optional. Missing `v` and `v=latest` both resolve through the family head. An explicit version always selects an immutable release.

An ID containing categories requests that exact variant. A name without categories selects the best variant in the release using the runtime category
resolver.

## Storage layout

All category variants of a doclet name belong to one versioned family:

```text
doclets/
  customerSummary/
    head.json
    releases/
      1.2.0/
        manifest.json
        customerSummary.md
        customerSummary.finance.md
        customerSummary.finance.he.md
      1.3.0/
        manifest.json
        customerSummary.md
        customerSummary.finance.md
        customerSummary.finance.he.md
```

Versions belong to the family, not to individual category variants. This prevents category resolution from combining files published at different
times.

### Head

`head.json` is the only mutable object in a family:

```json
{
  "name": "customerSummary",
  "tags": {
    "latest": "1.3.0"
  },
  "updatedAt": "2026-08-21T12:00:00Z"
}
```

`latest` is a version alias, not a category and not a copied release.

### Release manifest

Each immutable release contains a manifest describing its TGP variants and content objects:

```json
{
  "name": "customerSummary",
  "version": "1.3.0",
  "publishedAt": "2026-08-21T12:00:00Z",
  "sourceRevision": "a83f290",
  "variants": [
    {
      "id": "customerSummary",
      "categories": [],
      "description": "Summarize a customer",
      "content": "customerSummary.md",
      "sha256": "..."
    },
    {
      "id": "customerSummary.finance",
      "categories": ["finance"],
      "description": "Summarize a customer for finance workflows",
      "content": "customerSummary.finance.md",
      "sha256": "..."
    }
  ]
}
```

## Resolution

Resolution must choose the release before choosing the category variant:

1. Parse the ID into its first segment `name` and remaining `categories`.
2. Resolve missing `v` or `v=latest` through `head.json`; use an explicit `v` directly.
3. Load `releases/<version>/manifest.json`.
4. For an ID with categories, select the exact variant.
5. For a name-only ID, apply the existing category ranking to the variants in that release.
6. Fetch and return the selected Markdown object.

An unknown version or exact category variant returns not found. Resolution never falls back from an explicitly requested version or variant.

## Agent API

The Python agent treats published doclets as skills and exposes two operations:

```text
GET /api/v1/skills
GET /api/v1/skills/<id>?v=<version>
```

The list operation returns names, descriptions, latest versions, and available categories without loading Markdown content. The get operation applies the
WURL resolution rules and returns the selected variant metadata and content. A bucket catalog may cache list metadata, but family heads and immutable
release manifests remain authoritative.

## Publishing

Publishing a release is ordered so readers never observe a partial latest release:

1. Render every registered TGP variant whose first ID segment matches the doclet name.
2. Validate the version is new and the IDs, descriptions, categories, and rendered contents are valid.
3. Upload all Markdown files under the immutable release path.
4. Upload `manifest.json` after the content files and verify its checksums.
5. Update `head.json` last using an object-generation or ETag precondition.

If any immutable upload fails, `head.json` remains unchanged. Existing release objects are never overwritten.

## Rollback and caching

Rollback changes only `head.json` to point `latest` at an earlier release. Exact-version WURLs remain stable.

`head.json` should have a short or revalidated cache policy. Release manifests and Markdown objects can be cached indefinitely because their paths are
immutable.

## Package choice

Use a versioned directory plus manifest, following the applet snapshot pattern. A tarball is appropriate for executable code closures, but it adds
download and extraction overhead when a doclet consumer normally needs one Markdown variant.
