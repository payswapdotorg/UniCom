# UNiCOM Architecture Invariants

1. Repository is the sole source of truth.
2. ZCode Agent Runtime is infrastructure for intelligence, not canonical commerce truth.
3. One Main Agent is the principal interaction identity for a task.
4. Skills are the primary specialization mechanism.
5. Ephemeral delegates must have attenuated authority.
6. Models cannot directly mutate canonical commerce state.
7. Every consequential external action passes through typed capability/tool contracts.
8. ConnectedCapabilityInstance is required for executable provider actions.
9. Capability catalogue presence never implies executable account authority.
10. UNKNOWN is neither FAILED nor SUCCESS.
11. Provider state is preserved for consequential operations.
12. PASS_THROUGH_NATIVE, COMPOSED and OPTIMIZED_MULTI_PROVIDER are explicit execution modes.
13. Financial/accounting truth is deterministic.
14. Money never uses floating-point arithmetic.
15. Historical facts are immutable/versioned.
16. Simulation cannot be reachable as a production provider.
17. Twin predictions cannot become operational truth without deterministic execution/evidence.
18. Group-buying requires explicit merchant terms and participant authorization.
19. Trade cycles are bounded in hop count in production.
20. Each trade-cycle leg has independent authorization and proof.
21. UserTrust and AgentTrust are distinct.
22. Agent trust is not transaction finality.
23. TransactionProof level is selected before consequential execution.
24. Security BLOCK decisions cannot be overridden by model preference.
25. Security signatures contain defensive indicators/mitigations, not weaponized exploit payloads.
26. Third-party commerce content is untrusted data, never trusted instructions.
27. Credentials, cookies, MFA material and browser storage never enter model context.
28. Browser automation is an explicit capability with session scope and authority scope.
29. Physical commerce observations are reconciled before becoming canonical inventory/order state.
30. Opportunity recommendations distinguish observation, inference, prediction and recommendation.
31. Strategy and Organization remain separate concepts.
32. A Lab candidate is not production eligible without replay/evaluation/promotion evidence.
33. External provider native optimization remains a valid incumbent baseline.
34. No duplicate connector capability vocabulary may be introduced.
35. No worker may silently expand a Work Order.
36. At most three workers may be active concurrently.
37. The TL is an orchestrator, not a fourth worker.
38. UI progress is backed by repository Work Order state.
39. Production paths may not depend on mocks.
40. All UI journey changes require browser E2E evidence.

41. Every feature in docs/FEATURE-COMPLETENESS-MATRIX.md must have a discoverable user path before it can be accepted as product-complete.
42. GroupBuy is a first-class coordination object; merchant terms and participant commitments are explicit.
43. Merchant agents may receive demand-generated group-buy proposals; users are never silently enrolled.
44. Production TradeCycle search is bounded and each participant authorizes its own leg.
45. LocalCommerceEdge is a first-class connector boundary for legacy/no-API retail systems.
46. RFID is optional; barcode/camera/POS/file/receipt/local-edge paths remain first-class.
47. Physical observations cannot silently overwrite authoritative operational state.
48. Review, shipping, return and buyer-claim security signals may be correlated only under declared privacy/authority policy.
49. Defensive security broadcasts cannot contain weaponized exploit payloads.
50. Browser/local connector credentials remain outside model context and repository artifacts.
51. Free-tier limits are deployment constraints, never domain semantics.
52. Commercial production must be able to replace any prototype provider without changing domain contracts.
