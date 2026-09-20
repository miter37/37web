# Final design decisions

1. Playwright is the browser engine; the project is a learning/memory/execution layer above it.
2. `browserd` keeps browser/login/tab state alive across short-lived CLI invocations.
3. The same explicit task session must be used through Known and Discovery modes.
4. `sites/<site>/site.yaml` is the single source of truth. `target_sites.json` is generated.
5. Runtime evidence never lives in `site.yaml`; it is append-only under `.runtime/metrics`.
6. Knowledge lifecycle is Observed -> Encoded -> Candidate -> Verified.
7. Evidence/freshness is tracked per `(action, UI variant)`.
8. Risk is independent from confidence/lifecycle; unclassified actions are treated conservatively.
9. Write failures are verified before any retry; ambiguous outcomes are not blindly repeated.
10. Named fingerprints, states, preconditions, and extractors are separate concepts.
11. YAML remains a small declarative schema. Complex behavior goes to TypeScript `actions.ts`.
12. New UI variants extend known knowledge rather than replacing still-working paths without evidence.
13. Page text is untrusted observation data and never becomes authoritative agent instruction merely because it appears on a website.
14. Authentication/profile/secrets and raw runtime data stay outside Git.
15. Phase-zero baseline measurement is supported before adopting learned actions.
16. TypeScript is the only v0.1 site-extension language.
