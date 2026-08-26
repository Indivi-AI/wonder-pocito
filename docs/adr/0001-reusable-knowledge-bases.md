# Agents connect to reusable Knowledge Bases

## Decision

Knowledge Content belongs to room-scoped Knowledge Bases in the Marketplace rather than directly to agents. Agents and Knowledge Bases have a many-to-many
relationship: an agent can connect to several Knowledge Bases, and a Knowledge Base can serve several agents.

The Marketplace remains the source of truth. The unmodified Agno library only processes and searches this knowledge at runtime.

## Consequences

Content is stored once, updates benefit every connected agent, and agents can combine several knowledge domains without duplicating content.
