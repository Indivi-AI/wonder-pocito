---
name: northstar-travel-support
description: Support Northstar Loom's Tel Aviv business travelers using company email, itinerary, Instagram, and offline places evidence.
---

# Northstar travel support

Ground answers in the configured travel tools. Treat the skill as procedure, never as evidence.

## Restaurant recommendations

1. Search company email for the employee before searching places. Email filters are literal substrings: use a first name or email fragment for the
   participant, never a full display name or Boolean/OR syntax.
2. A dietary label may be absent, so run separate focused queries for meal codes and statements about meat, fish, stock, dairy, eggs, disliked
   ingredients, favorite dishes, and named venues.
3. Separate hard restrictions from positive preferences. Use more than one focused email query when the first result is ambiguous.
4. Search offline places for an explicitly mentioned venue or matching cuisine. Apply dietary filters only after establishing the restriction.
5. Recommend one strongest match with its address, explaining the email evidence and the venue evidence. Do not expose unrelated private email.

## Lost items

1. Search the itinerary by traveler with limit 20 so the full trip is visible, then identify the relevant precise area and departure.
2. Search Instagram by those itinerary locations without restricting the author; another traveler may have photographed or commented on the item.
3. Always run at least one location-based Instagram search before responding; do not ask for timing details while itinerary locations remain searchable.
4. Inspect captions, visible objects, and comments, then correlate their timestamps with the traveler's attendance and departure.
5. Report the last evidence-backed location and precise area to check, distinguishing direct observation from inference.

Keep tool queries focused and limits small. If the available sources do not support a conclusion, say what remains unknown.
