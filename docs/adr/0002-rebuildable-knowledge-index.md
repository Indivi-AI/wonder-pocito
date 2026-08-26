# Knowledge indexes are rebuildable runtime state

## Decision

Knowledge Content and metadata are stored in the room's Marketplace S3 namespace. AgentOS materializes that content into a room-scoped local LanceDB index through
Agno when a connected agent runs. The index is a cache and can be rebuilt from Marketplace data.

## Consequences

Marketplace ownership remains independent of an AgentOS process. A new or restarted AgentOS can rebuild its index, while content changes invalidate only the
affected Knowledge Base.
