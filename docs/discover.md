# Discover

Discover searches people, claims, cards, and artifacts.

Current search is a rule/full-text hybrid. It is evidence-backed, but it is not production semantic/vector search yet.

## Result Shape

Search results include:

- person
- score
- explanation
- evidence
- matchedClaims
- matchedCards
- matchedArtifacts
- topSkills
- profileUrl

## Ranking Signals

The current ranking combines:

- skill and topic matches
- artifact title, description, and metadata matches
- profile claim text
- card title and content
- public impact signals such as stars and forks
- recency
- profile completeness

Evidence-backed matches should rank above weak profile-text-only matches.

## Demo Queries

- AI agent builders with TypeScript and MCP
- researchers working on language models
- open-source infrastructure engineers
- people with manual notes about product design

