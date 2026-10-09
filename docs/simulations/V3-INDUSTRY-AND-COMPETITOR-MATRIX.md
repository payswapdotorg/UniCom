# V3 Industry and Incumbent Benchmark Matrix

Purpose: select representative alternatives for the capabilities UNiCOM claims to provide. This is a workload-based comparison set, not a claim that each named vendor is the single most-used product in every market or geography. The TL must record the actual geography, product edition, access tier and evidence class used in each run.

## Cohort design

Each industry is represented by three synthetic firms:

| Firm tier | Synthetic staff personas | Projects per firm | Primary stressor |
|---|---:|---:|---|
| Small | 25 | 200 | Low admin capacity, price sensitivity, owner approvals, minimal integrations |
| Medium | 150 | 200 | Cross-functional handoffs, supplier coordination, multiple simultaneous projects |
| Large | 1,000 | 200 | Governance, segregation of duties, auditability, multi-entity scale and long-tail exceptions |

Total = 13 industries × 3 tiers = 39 firms; 39 × 200 = 7,800 project runs; 13 × (25 + 150 + 1,000) = 15,275 synthetic professional personas.

## Industry cohorts

### 1. Construction / engineering / general and specialty contracting
Representative incumbent stack: Autodesk Forma/Autodesk Build, Procore, and a scheduling/finance tool already selected in the synthetic firm (e.g. Primavera P6 or Microsoft Project plus an accounting/ERP system).
Project scenarios: bid/estimate, RFI/submittal and change-order procurement, materials delay, supplier failure, rental vs purchase of equipment, multi-site delivery, payment recourse, field/offline capture and evidence at material/method level.
Sources:
- Autodesk Forma construction project management: https://construction.autodesk.com/workflows/construction-project-management/
- Procore construction financial management: https://www.procore.com/financial-management

### 2. Finance / banking / accounting
Representative incumbent stack: a ledger/accounting tool (QuickBooks/Xero for smaller firms or an enterprise ERP), spreadsheet-based analysis, and a workflow/CRM tool where relevant.
Project scenarios: audit preparation, procurement under budget, month/quarter close dependencies, supplier risk, vendor onboarding, approvals/segregation of duties, reconciled purchase and invoice status.
Boundary: UNiCOM is compared only for purchasing, projects, approvals, commerce operations and coordination it claims to support—not as a replacement for licensed core banking, payment rails or a statutory accounting ledger unless explicitly implemented and independently certified.
Candidate official references to be pinned by the TL before benchmark freeze: Intuit QuickBooks, Xero, Oracle/NetSuite, SAP.

### 3. Sales / business development
Representative incumbent stack: Salesforce or HubSpot CRM, email/calendar, collaboration software and existing purchasing/expense systems.
Project scenarios: enterprise deal pursuit, demo/event sourcing, customer onboarding, proposal procurement, sales campaign budget, group-buy/partner offers, account renewal and price negotiation.
Candidate official references to be pinned by the TL before benchmark freeze: Salesforce Sales Cloud, HubSpot CRM.

### 4. Technology / software / IT services
Representative incumbent stack: Jira + Confluence and source-hosting/collaboration tools; ServiceNow for enterprise service/change workflows where applicable.
Project scenarios: multi-team product launch, incident remediation procurement, cloud/tool purchase, vendor selection, security exception, release dependency, change approval and device procurement.
Sources:
- Jira project management and agent workflows: https://www.atlassian.com/software/jira
- ServiceNow ITSM workflows: https://www.servicenow.com/products/itsm.html

### 5. Healthcare operations (non-clinical)
Representative incumbent stack: the organization's existing EHR context where relevant (e.g. Epic), ERP/supply chain and service/workflow systems. The simulated tasks are procurement, inventory, facilities, devices, logistics and project coordination only.
Project scenarios: clinical-supply replenishment without clinical data, recall/expiry workflow, facility project, device acquisition, maintenance supplies, supplier disruption and controlled approval.
Sources:
- Oracle Health clinical operations and supply inventory: https://www.oracle.com/health/clinical-operations/
- Oracle healthcare ERP/SCM: https://www.oracle.com/health/erp/
Safety boundary: no PHI or simulated clinical decision making is required to prove UNiCOM procurement/project journeys.

### 6. Transportation / logistics / delivery
Representative incumbent stack: Samsara and/or Motive for fleet/dispatch, a transportation-management tool and accounting/procurement software.
Project scenarios: 200-stop seasonal delivery programme, replacement vehicle/parts procurement, fuel-cost shock, vehicle downtime, route changes, depot inventory, subcontractor sourcing, proof-of-delivery dispute and fleet-maintenance planning.
Sources:
- Samsara fleet management: https://www.samsara.com/products/telematics
- Motive dispatch: https://gomotive.com/products/fleet-dispatch-workflow/

### 7. Hospitality / restaurants / hotels / travel
Representative incumbent stack: Oracle OPERA Cloud for hotel/property workflows where applicable; Toast or Lightspeed-style POS/restaurant systems; procurement and scheduling tools.
Project scenarios: opening or renovating a site, supplier failure before peak occupancy, banquet sourcing, room/food inventory, staffing equipment procurement, event sales, refunds and local group buying.
Sources:
- Oracle OPERA Cloud PMS: https://www.oracle.com/hospitality/hotel-property-management/hotel-pms-software/
- Toast restaurant POS and inventory: https://pos.toasttab.com/restaurant-pos

### 8. Fashion / apparel / retail brands
Representative incumbent stack: Centric PLM/Planning, Shopify or another commerce platform, marketing/CRM and supplier tools.
Project scenarios: collection launch, fabrics and trims sourcing, sample revisions, supplier lead-time shock, seasonal markdown, resale/rental, inventory allocation and traceability.
Sources:
- Centric fashion/apparel lifecycle and planning: https://www.centricsoftware.com/fashion-apparel
- Centric PLM product lifecycle: https://www.centricsoftware.com/what-is-centric-plm

### 9. Entertainment / media / production
Representative incumbent stack: Adobe Creative Cloud/Frame.io-style media collaboration, project management (e.g. Jira/Asana/Monday-style), cloud storage and procurement.
Project scenarios: multi-location production, equipment rental vs purchase, rights/approval dependencies, talent/vendor sourcing, post-production handoff, live event procurement, deadline change and budget recourse.
The TL must mark tools based on observed available evidence, not assume access to paid creative tools.

### 10. Legal / professional services
Representative incumbent stack: Clio for practice management, iManage for document/email governance and an office/collaboration suite.
Project scenarios: matter-related purchasing, document-management software evaluation, deadline-bound client project, expert/vendor procurement, billing/control review, confidential access scopes and audit evidence.
Sources:
- Clio practice management: https://www.clio.com/manage/
- iManage knowledge, document and email governance: https://imanage.com/
Boundary: do not use real privileged material or represent UNiCOM as replacing a regulated matter/document system unless that capability has been implemented and validated.

### 11. Defense / security / government contracting
Representative incumbent stack: Deltek Costpoint for GovCon project finance/procurement, plus authorized task, service or security operations systems.
Project scenarios: synthetic unclassified supply-chain disruption, approved equipment sourcing, cost audit, contract change and security incident purchasing.
Sources:
- Deltek Costpoint ERP: https://www.deltek.com/products/erp/costpoint/
- Deltek supply chain and procurement: https://www.deltek.com/products/erp/costpoint/procurement/
Boundary: no classified, export-controlled, real CUI, operational targeting or live defense-system data/actions.

### 12. Manufacturing / supply chain
Representative incumbent stack: ERP/MRP and procurement suite (e.g. SAP/Oracle), engineering/project software and supplier quality tools.
Project scenarios: bill-of-materials procurement, parts shortage, substitution approval, lot/serial traceability, quality hold, supplier recall, multi-facility replenishment and predictive downtime purchasing.
Sources: Oracle's healthcare/supply-chain materials can be a general candidate entry point, but the TL must pin manufacturing-specific official product documentation before freezing the exact baseline.

### 13. Supermarkets / local retail / no-RFID shops
Representative incumbent stack: the store's existing POS (e.g. Square or Shopify POS where relevant), barcode/camera/count flows, spreadsheets, receipts and supplier feeds. A no-RFID cohort is mandatory.
Project scenarios: catalog import, weighted produce, PO receiving, barcode/camera cycle counts, expiry/recall, offline count, reconciliation, local replenishment, group-buy, substitution, customer dispute and supplier price shock.
Official reference for no-RFID workflow options: https://pos.toasttab.com/restaurant-pos and platform inventory/product workflows already cited in docs/SUPERMARKET-WITHOUT-RFID.md. Do not assume RFID.

## Benchmark fairness rules

For every firm:
- Define the required in-scope capabilities before seeing results.
- Select incumbent tools per firm size and the industry scenario, rather than forcing a single enterprise stack on small companies.
- Pin product/edition and evidence class.
- Run comparable task goals, inputs, constraints and failure conditions.
- Record if the competitor evidence is A (actual accessible UI), B (official interactive UI/demo), or C (official documents only).
- Do not compare modeled competitor speed against measured UNiCOM speed and label it a measured win.
- Do not infer market share or "most popular" rank from vendor marketing claims.
- Record untested, paywalled or inaccessible incumbent workflows explicitly as UNKNOWN, not as UNiCOM wins.
