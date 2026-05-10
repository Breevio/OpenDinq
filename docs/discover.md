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
- scoreBreakdown

Discover only receives public-profile-shaped data from the API. Hidden cards and rejected claims are filtered before ranking.

## Ranking Signals

The current ranking combines:

- skill and topic matches
- artifact title, description, and metadata matches
- profile claim text
- card title and content
- public impact signals such as stars and forks
- recency
- profile completeness
- exact phrase match boosts
- small published-profile boost
- evidence-backed claim/card/artifact matches

Evidence-backed matches should rank above weak profile-text-only matches.

## Score Breakdown

Each result includes `claimScore`, `cardScore`, `artifactScore`, `skillScore`, `evidenceScore`, `publishBoost`, `recencyScore`, and `finalScore`.

The UI shows a compact "why matched" breakdown plus matched claims, cards, artifacts, and evidence snippets.

## Demo Queries

- AI agent builders with TypeScript and MCP
- researchers working on language models
- open-source infrastructure engineers
- people with manual notes about product design
- people with strong evidence in product design
- profiles with manual notes about startups
- evidence-backed profile cards

## UI Behavior

The Discover page includes suggested query chips, loading/error/empty states, and result cards that lead with the match explanation. Result cards show matched claims, matched cards, evidence snippets, top skills, and a profile link.
