# Flow package v2 field inputs

## Goal

Let a user create a Flow package tool from one `package/v2/{packageId}` response. The user selects input fields per query, assigns each selected
field a fixed value or exposes it to the agent, keeps output selection unchanged, and reviews the resulting function contract before saving.

## Accepted assumption

The real FLAPI runtime accepts selected v2 fields at `package/v3/{packageId}` in this shape:

```json
{
  "<Query.id>": {
    "<Field.Name>": "<value>"
  }
}
```

The local FLAPI mock accepts this payload but does not implement field filtering. No FlowBolt API change is in scope.

## Alternatives

| Alternative | Simplicity | Reliability | Maintainability | Decision |
| --- | ---: | ---: | ---: | --- |
| Explicit `input_bindings` list | 4 | 5 | 5 | Selected |
| Add configuration to copied `Queries.Fields` | 4 | 3 | 3 | Reject: mixes source metadata with user configuration |
| Separate dynamic and fixed maps | 5 | 3 | 3 | Reject: duplicates identity and validation logic |

## Stored tool contract

Flow package tools retain `package_id`, `input_schema`, and `output_cubes`, and add `input_bindings`:

```json
{
  "package_id": "101",
  "input_bindings": [
    {
      "query_id": "query-101-Emails",
      "query_name": "Emails",
      "field": "subject",
      "display_name": "Subject",
      "type": "string",
      "mode": "dynamic",
      "description": "Email subject to search"
    },
    {
      "query_id": "query-101-Emails",
      "query_name": "Emails",
      "field": "from",
      "display_name": "From",
      "type": "string",
      "mode": "fixed",
      "value": "ron@example.com"
    }
  ],
  "input_schema": [
    {
      "Name": "subject",
      "DisplayName": "Subject",
      "Type": "string",
      "Description": "Email subject to search",
      "QueryId": "query-101-Emails"
    }
  ],
  "output_cubes": []
}
```

`input_bindings` is the complete selected-field configuration. `input_schema` is derived from its dynamic bindings and remains the AgentOS-facing
schema. Fixed bindings never appear in the agent function schema.

When field names collide across queries, the agent parameter name is `<normalized-query-name>__<field>`. A unique field keeps its plain name.
Each dynamic schema row stores its `QueryId`, allowing runtime reconstruction without relying on the exposed parameter name.

## Package loading

Wonder's Marketplace proxy requests only `package/v2/{packageId}` and returns its metadata. The UI does not request or depend on
`package/v1/quick/{packageId}`.

Loading a different package replaces the current package metadata, clears input bindings, and clears output cubes, matching the existing package
replacement behavior.

## Input configuration UI

The input step lists `metadata.Queries` as selectable, expandable query cards. Each card lists its `Fields`.

Selecting a field enables two modes:

- `Dynamic`: requires a non-empty user-authored description and appears in the agent schema.
- `Fixed`: requires a typed value and is embedded in every execution.

An unselected field is neither stored nor sent. A selected query must contain at least one selected field. Removing its final selected field must
also deselect the query or leave the step invalid until the user does so.

The editor uses the v2 Field `Type` for the fixed-value control and for JSON Schema generation. Boolean false and numeric zero count as supplied
fixed values.

## Output configuration

Output configuration remains independent and unchanged. Selecting an input query does not select an output cube, and selecting an output cube
does not create input bindings.

## Summary

A final read-only wizard step shows:

- Function signature containing only dynamic agent parameters.
- Fixed query fields and their embedded values.
- Selected output cubes and their returned fields.

Example:

```text
searchCompanyEmail(subject: string) -> { Emails: Email[] }

Fixed:
  Emails.from = "ron@example.com"
```

The user cannot finish while any selected dynamic field lacks a description, any fixed field lacks a value, or any selected input query has no
selected fields.

## Runtime

AgentOS derives JSON Schema only from dynamic bindings. On invocation it:

1. Starts with fixed binding values.
2. Adds agent values for dynamic bindings.
3. Groups values by `query_id`.
4. Sends only selected fields to `package/v3/{packageId}`.

Agent values override nothing fixed because a binding has exactly one mode. Unselected fields are omitted even when FLAPI has its own defaults.

## Existing tools

Legacy Flow package tools without `input_bindings` keep the existing flat `input_schema` execution path. Editing and reloading their package
metadata moves them to the new binding model. No stored manifest migration is required.

## Validation and errors

- Marketplace accepts only binding modes `dynamic` and `fixed`.
- Binding identity is unique by `query_id` and `field`.
- Dynamic descriptions are non-empty.
- Fixed values match the supported v2 field type.
- Runtime rejects a missing dynamic argument through its generated JSON Schema.
- FLAPI execution errors continue through the existing tool error path.

## Verification

- UI tests cover package loading through v2 only, query selection, field modes, validation, collisions, summary, and unchanged output selection.
- Marketplace tests cover create, read, update, and backward compatibility of `input_bindings`.
- AgentOS tests verify dynamic-only JSON Schema and the exact grouped v3 payload containing fixed plus dynamic values.
- Browser verification creates a tool, reviews its summary, assigns it to an agent, and runs it through the existing Pocito applet flow.
- The real FLAPI integration test is expected to prove filtering; the local mock verifies request shape only.
