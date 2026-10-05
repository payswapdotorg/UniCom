# UNiCOM for Supermarkets Without RFID

## Answer

A supermarket can use UNiCOM extensively without RFID. RFID is an optimization layer, not a prerequisite.

A practical no-RFID deployment can use:
- existing POS;
- GTIN/UPC/EAN barcodes;
- USB/Bluetooth scanners;
- phone/tablet cameras;
- CSV/Excel exports;
- supplier feeds;
- purchase orders/invoices;
- receipts;
- browser access;
- local network/USB/serial connections;
- manual or scanner-scale workflows for weighted goods;
- periodic shelf/cycle-count scans;
- optional camera/shelf observations.

Square already supports product creation with GTIN barcode scans using a phone camera, camera/scanner inventory counts, and scanner-scale workflows for grocery/retail. Shopify POS supports barcode inventory receiving/adjustment, multi-location inventory, purchase orders and QR-based product experiences. These are useful precedents for a low-hardware UNiCOM deployment.

## Deployment ladder

### Level 0 — Data import
The supermarket uploads catalog, sales, stock, supplier and purchase-order exports.

UNiCOM provides catalog, analytics, buyer intent, opportunities and merchant-agent functionality.

### Level 1 — Mobile barcode workflow
A UNiCOM mobile/PWA flow lets employees:
- scan items;
- create catalog entries;
- count stock;
- receive deliveries;
- transfer stock;
- perform cycle counts;
- verify shelves;
- handle low-stock tasks.

### Level 2 — Existing POS
Connect through API/webhooks when available.

If no useful API exists, use:
- browser connector;
- scheduled exports;
- shared files;
- local network;
- USB/serial;
- local Edge Connector.

### Level 3 — UNiCOM Edge
A small process on an existing store computer/tablet acts as the physical connector.

It can operate against authorized local interfaces while keeping credentials and local sessions outside model context.

It buffers observations during internet outages and syncs them idempotently when connectivity returns.

### Level 4 — Visual shelf intelligence
Staff or authorized cameras provide periodic images.

UNiCOM can estimate:
- stockout;
- misplaced product;
- shelf availability;
- facings;
- price-label mismatch.

These remain observations until reconciled.

### Level 5 — RFID/sensor automation
Optional later:
- RFID;
- smart shelves;
- digital labels;
- advanced sensors;
- automated item-level checkout.

## What works very well without RFID

- catalog management;
- POS/order synchronization;
- inventory forecasting;
- replenishment;
- purchase orders;
- buyer intent;
- local pickup/delivery;
- group-buy discovery/formation;
- merchant group-buy proposals;
- resale/rental discovery;
- multi-hop trade coordination;
- marketing;
- customer service;
- security/fraud analysis;
- autonomous-store planning and constrained execution.

## What RFID improves

RFID mainly improves:
- simultaneous item identification;
- rapid receiving;
- rapid cycle counting;
- item-level location;
- shrink/loss detection;
- walk-out automation.

Therefore UNiCOM should never require a supermarket to buy RFID before it can participate.

## Truth hierarchy for supermarket inventory

Distinguish:
1. POS-reported stock;
2. barcode/cycle-count observation;
3. employee-entered count;
4. supplier-reported stock;
5. visual estimate;
6. predictive estimate.

Only reconciled deterministic state becomes canonical inventory truth.

## Recommended starter architecture

Store POS / files / scanners / phones
→ UNiCOM Edge
→ Commerce Network
→ Catalog / Inventory / Orders / Twin
→ Buyer + Merchant Agents
→ Opportunities / Group Buy / Security / Organization Lab

This makes a legacy, low-tech supermarket a first-class UNiCOM participant without requiring RFID or replacing its existing equipment.
