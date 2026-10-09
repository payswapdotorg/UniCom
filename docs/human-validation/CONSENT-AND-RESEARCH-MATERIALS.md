# UNiCOM Real-Human Validation — Consent and Research Materials Package (PREPARE-ONLY v1.0)

Companion to docs/human-validation/STUDY-PROTOCOL.md. **Templates for operator review only — NOT for use.** No materials have been sent to anyone. Placeholders in ⟨angle brackets⟩ are filled by the study director only after the operator authorizes the study (Study Protocol §0).

## §S. Recruitment screener (template)

1. Thank-you + one-line study description: "We are researching how professionals handle everyday commerce tasks (ordering, purchasing, inventory, wholesale, rentals). This is a research session, not a sales call."
2. Eligibility questions (record as structured codes, no free text retained):
   - S1 Age 18+? (yes/no)
   - S2 Industry sector (select from the 13 matrix industries)
   - S3 Approximate firm size (25 / 150 / 1,000 band: small/medium/large)
   - S4 Role (buyer/requester; merchant/store owner; procurement/ops; owner/safety; other-specify)
   - S5 Which commerce tasks performed in the last 12 months (multi-select: sourcing/quotes; purchasing/POs; orders/returns; inventory/POS; wholesale/B2B; rental; resale)
   - S6 Tools used for those tasks (multi-select from the matrix incumbent categories + "other")
   - S7 Employment/contract with a commerce-platform vendor? (yes/no; if yes, exclude)
   - S8 Prior UNiCOM research participation? (yes/no; if yes, exclude)
   - S9 Availability for two 60–90 minute remote/in-person sessions; consent to screen recording?
   - S10 Preferred language
3. Consent-to-contact statement: "May we contact you ⟨channel⟩ about scheduling if you are eligible? You can opt out at any time." (Contact data goes to the external study register — never this repository.)

## §C. Informed consent form (template)

**Study title:** ⟨title⟩ — a research study about commerce workflows and a prototype commerce tool.
**Researchers:** ⟨study director; organization; contact⟩. **Sponsor:** ⟨operator entity⟩.

1. **What this is.** A research study with two sessions (60–90 min each). You will perform everyday commerce tasks on an early prototype in a safe test environment with synthetic data, and talk about how you do similar tasks today.
2. **What is NOT happening.** No real purchases, orders, payments or commitments; the prototype runs on isolated test data. This is not a product demo or sales engagement.
3. **What we ask of you.** Think aloud during tasks; answer interview questions; allow screen recording (optional: camera off is fine); optionally show us (never send us) your own current tool during the comparison segment — you choose what to show, and you may skip any question or stop at any time.
4. **Risks.** Normal computer-task fatigue; possible mild frustration when we simulate problems (disclosed in advance as "we will simulate some problems"); residual re-identification risk in publications, minimized via pseudonymization and aggregate reporting.
5. **Data handling.** Contact data is kept in a study register outside the code repository and destroyed after ⟨90 days or per policy⟩. Recordings/transcripts are pseudonymized, encrypted, and deleted within 12 months of study close; anonymized transcripts 36 months; aggregate results may be published. You choose your data disposition if you withdraw.
6. **Compensation.** ⟨amount⟩ per session, paid regardless of performance, and in full even if you withdraw early.
7. **Voluntariness and withdrawal.** Participation is voluntary. You may withdraw at any time without reason or penalty — verbally is enough. Choose: delete everything / keep published aggregates / retain recording but exclude from analysis.
8. **Confidentiality limits.** Researchers will not deliberately collect trade secrets; you are asked not to share confidential pricing or customer data; standard research-confidentiality limits are described here: ⟨limits⟩.
9. **Contacts.** Study director ⟨name/email⟩; privacy contact ⟨name/email⟩; ethics/IRB contact if applicable ⟨name/email⟩.
10. **Consent statements.** □ I am 18+; □ I have read and understood this form; □ I agree to take part; □ I agree to screen recording; □ I agree to optional camera; □ I understand I can withdraw.
Signature / recorded verbal consent + date. Copy provided to participant.

## §T. Task script cards (facilitator-facing; participant instructions in plain language)

General rules: begin every task from the ordinary landing screen (no deep links) — journey family J19 (discovery) is embedded in every card's first step; the facilitator may only use neutral probes from the probe list; all outcomes use the §6 vocabulary of the Study Protocol.

**Card T-01 (TP-03 / J1):** Setup: buyer role on home surface. Instruction: "You need ⟨item⟩, must spend no more than ⟨budget⟩, need it by ⟨deadline⟩, and prefer pickup nearby. Set that up however makes sense to you." Success: intent recorded with ≥3 constraint dimensions visible in UI; Probes: "What are you expecting this to remember?"

**Card T-02 (TP-01, TP-02 / J2):** "Find suppliers for ⟨item⟩ and compare at least two offers on whatever matters to you." Success: ≥2 offers compared on ≥2 dimensions; note any stale/UNKNOWN indicator behavior.

**Card T-03 (TP-04 / J3):** "Decide whether to buy now or wait; you may negotiate or pick a substitute if your constraints allow." Success: an explicit decision path surfaced (timing/price, negotiation or substitution) with constraints respected.

**Card T-04 (TP-05 / J4):** "Find the open group buy for ⟨item⟩ and join it if the rules look right to you; you may leave before commit." Success: commitment rules seen before joining; leave-before-commit exercised if supported.

**Card T-05 (TP-07 / J6):** "You need ⟨gear⟩ for a 3-day shoot. Compare renting vs buying; check deposit and what happens if it's damaged." Success: period/deposit/condition/recourse terms surfaced and compared.

**Card T-06 (TP-08 / J7):** "You have an under-used ⟨asset⟩. Get it ready to sell/rent out — but nothing goes live without you saying so." Success: listing prepared; explicit user authorization required before publish.

**Card T-07 (TP-12 / J10):** (merchant role) "Add a product with two variants, set a price, create a 10% promotion, and look at today's orders." Success: catalog+price+promotion created; order view found.

**Card T-08 (TP-10 / J11):** "Create a requisition for ⟨items⟩, get it approved, release the PO, then receive only part of it." Success: approval visible; partial receiving reflected; stock updates only after reconciliation where claimed.

**Card T-09 (TP-11 / J10):** "Order ⟨item⟩, track it, then return it saying it arrived damaged; ask for a refund." Success: order status tracked; return+refund path completed with evidence shown.

**Card T-10 (TP-13 / J12):** "As a wholesale buyer, get the B2B price list for ⟨supplier⟩ and place a bulk order with your PO number." Success: price list/quote seen; PO number attached; minimum-order rules respected.

**Card T-11 (TP-14 / J16):** "Receive this delivery, count stock with the barcode scanner mode, and reconcile the mismatch you find." Success: receiving recorded; count entered; mismatch surfaced and reconciled explicitly.

**Card T-12 (TP-06 / J5):** (Session B) "Two other buyers want ⟨item⟩. See if you can form a group and propose a deal to the merchant; the merchant will counter." Success: recruitment + proposal visible; merchant counter handled; no silent enrollment.

**Card T-13 (TP-09 / J9):** "Complete the trade cycle with the other two participants; each leg must be individually approved. At one point, we'll remove a consent — react however you would." Success: per-leg authorization observed; missing-consent probe handled safely (cycle halts or blocks).

**Card T-14 (TP-17 / J18):** (failure probes, disclosed as simulated) stale supplier response; UNKNOWN order state; double-click duplicate submission; approval missing. Success: user-visible state and recovery in each; duplicates safely rejected or deduplicated.

**Card T-15 (TP-16 / J17):** "This order is wrong (counterfeit suspicion). Pursue it as you would in real life." Success: evidence path and recourse resolution observed.

**Card T-16 (TP-15 / J8):** Review the opportunities surfaced (price drop, warranty, subscription savings, shared logistics): "Which of these would you act on? Why / why not?" Success: feature discovery + value judgment captured.

**Card T-17 (TP-18 / J13):** "Let the store suggest today's replenishment; check the limits before approving; the suggestion will exceed one limit — handle it." Success: limits visible; exceeding suggestion blocked or escalated; stop condition respected.

**Card T-18 (TP-19 / J14):** "Run a what-if: what happens if demand doubles next week? Then confirm nothing in the real store changed." Success: scenario executed; canonical state provably unchanged.

## §I. Interview and usability questions (post-session)

Per-task (asked immediately after each card):
1. How easy or difficult was that? (1–5)
2. What nearly stopped you?
3. Anything the tool did that surprised you — good or bad?

Post-session comparison block (RQ2; incumbent side first):
4. For the tasks we just did: walk me through how you do that today, in your own tool — step by step. (verbatim capture)
5. What does your current tool do better? What did the prototype do better? (order counterbalanced)
6. If your current tool vanished tomorrow, which of today's tasks would you honestly trust to the prototype? Which not?
7. (If group buy shown) Under what conditions would you commit to a group buy at work?
8. (If multi-hop trade shown) Would you join a trade chain with two other firms? What would you need to see first?
9. (If autonomy shown) What limits would your company require before letting a tool order anything on its own?
10. (If failure probes shown) When something goes wrong in your current tool, what do you do? Did the prototype behave the way you'd expect?

Closing: 11. Anything we didn't ask that we should have? 12. Would you be willing to return for a follow-up session?

## §R. Role/industry/firm-size sampling tracker (template)

| Participant ID | Industry (13) | Size (S/M/L) | Role | Task cards assigned | Session A date | Session B date | Outcome denominator status | Withdrawal status |
|---|---|---|---|---|---|---|---|---|

(Tracker is kept in the external study register during the study; only aggregates enter the repository.)

## §W. Withdrawal script (facilitator)

"That's completely fine — we can stop at any point. Everything up to now can be deleted or kept, your choice: (a) delete everything, (b) keep already-published aggregates, (c) keep the recording but exclude it from analysis. Your compensation is unaffected. You can also change your mind later by contacting ⟨study director⟩ before ⟨deletion window date⟩."

## §L. Labels (mandatory on every artifact that references V3 or incumbent evidence)

- "SYNTHETIC SIMULATION ESTIMATE — generated from synthetic personas in the V3 simulation; not human data."
- "INCUMBENT EVIDENCE CLASS ⟨A/B/C/D⟩ — see docs/competitors/EVIDENCE-LEDGER.md; class D supports no claim."
- Human-evidence artifacts are additionally watermarked: "HUMAN SESSION DATA — collected under informed consent on ⟨date range⟩; aggregate and pseudonymized."
