# Threat model

Primary assets are institution and instrument data, scanned financial documents, review/release decisions, audit history, credentials and provider secrets. Key risks include cross-institution IDOR, forged role/status fields, malicious uploads, private URL leakage, OCR error or content injection, replay/races, privileged misuse, sensitive logs, NoSQL injection, and secret exposure.

The detailed controls and release checklist are in the [architecture blueprint](../../outputs/depositguard-architecture.md#9-threat-model-and-security-checklist). The initial foundation exposes no instrument or document data. Production readiness requires the checklist to be addressed and the unresolved identity, privacy, retention and workflow rules to be approved.
