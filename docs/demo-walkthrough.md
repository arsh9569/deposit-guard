# Deterministic synthetic demonstration

The client prototype and local seed provide the same 24 FDR records for the fictional **Northbridge Synthetic Institute**. All bank names are invented. Seed API data and private PDF fixtures into a local MongoDB instance before starting the demo:

```powershell
$env:DEMO_PASSWORD = 'choose-a-local-demo-password'
npm run seed:demo --workspace @depositguard/server
```

The script refuses to run in production, requires a password supplied locally, and creates no bank credentials. Sign in as `operator@northbridge.example` or `reviewer@northbridge.example` with the password originally supplied at seed time. Demo users use reserved `.example` email addresses. To provision the requested separate demo accounts and roles without resetting existing passwords, run `npm run provision:demo-users --workspace @depositguard/server`; new-account passwords are generated once and printed by the command. PDF files are generated deterministically, visibly marked **SYNTHETIC DEMO ONLY - NOT A FINANCIAL DOCUMENT**, and stored in the private document directory. Do not attach real financial documents or personal information to the demo. Maturity dates are calculated relative to the seed date.

## Demo role access

| Role | Access |
| --- | --- |
| Institution administrator | All institution features, user/role management, workflow policy, and oversight |
| Institution operator | Create FDRs, run verification, create renewals and release requests, and view operational queues |
| Official reviewer | Review submissions, decide renewals/releases, and read institution queues and reports |
| Auditor | Read dashboard, verification results, maturity status, notifications, and audit reports |

User and role administration is institution-scoped, audited, and available only to active institution administrators. Server routes enforce permissions; hiding a navigation item is not the authorization control.

## Walkthrough

1. Sign in with an institution operator account and open **FDR register**. Use synthetic values and an explicitly synthetic fixture document only. Save the draft, then submit it. The prototype confirms that the submission entered its synthetic review queue.
2. Open **Document review**. `FDR-2026-018` has submitted principal amount ₹25,00,000 and a pretested document fixture amount of ₹24,50,000. Show the amount discrepancy and confidence. The server seed includes the extracted values and raw result; the demo does not depend on a live OCR service.
3. Sign in with an official reviewer account, open **Official scrutiny**, enter an observation, and request correction. Open **Audit & reports** to show the seeded correction decision event for the same reference. The original document and extraction remain identified as preserved.
4. Open **Verification**. The page starts with the deterministic simulated match. Select **Run demo attempt** to alternate to the deterministic simulated mismatch, and run it again to return to match. The persistent warning and status label say **Not Bank Confirmed**; no bank is contacted.
5. Open **Maturity & actions** to show the reminder in the configured window. `FDR-2025-042` is the replacement for `FDR-2024-106`; the predecessor remains in the register. `FDR-2024-220` has the separate release request history.
6. Open **Release / refund**. Add a scrutiny observation and authorize the request for `RR-2026-004` on `FDR-2024-220`. The page remains at approved/awaiting processing. Completion requires a separate evidence reference and does not initiate a transfer.
7. Return to **Overview**, then open **Audit & reports**. The dashboard uses the institution API response; the report is a searchable synthetic activity fixture. Use the metrics, maturity queue, pending counts, and activity history to illustrate how one queue and audit timeline reduce manual follow-up.

## Seed scenarios

| Reference | Demonstration scenario |
| --- | --- |
| `FDR-2026-018` | Submitted and awaiting official review; pretested OCR amount mismatch |
| `FDR-2025-042` | Replacement instrument linked to `FDR-2024-106` |
| `FDR-2026-003` | Maturity reminder within 12 days |
| `FDR-2024-106` | Predecessor instrument; historical data and document remain available |
| `FDR-2024-220` | Matured instrument with a release/refund request awaiting authorization |
| `FDR-2026-021` | Deterministic simulated match, never bank confirmed |
| `FDR-2026-022` | Deterministic simulated mismatch, never bank confirmed |
| `RR-2026-004` | Release/refund scrutiny and authorization example |

The full dataset contains 24 FDRs: the walkthrough records above plus `FDR-DEMO-001` through `FDR-DEMO-015`. Together they include active and pending-review records, two OCR discrepancies, simulated match and mismatch outcomes, upcoming and matured instruments, two replacement chains, and three pending release/refund requests. Each seeded FDR has a generated synthetic PDF fixture; no real bank document or personal account data is used.

The prototype's form interactions and activity report are local synthetic demonstration behavior. They do not write those interaction results to the server database. The dashboard loads its metrics from the API; seeded records provide the non-empty live metrics.
