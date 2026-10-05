/**
 * Contract test 6 — connector transport coverage
 * (W3-001 §6.6, FROZEN §3.D/§17, connector acceptance).
 *
 * The transport contract set must cover: API/SDK, REST/GraphQL,
 * MCP/UCP/ACP/A2A adapters, CLI, file/feed/EDI/SFTP/email, browser,
 * live commerce and physical edge. Commands are idempotent and carry
 * authorization.
 */

import { describe, expect, it } from "vitest";
import {
  CONNECTOR_TRANSPORTS,
  KNOWN_EXECUTION_MODES,
  type ConnectorCommandRequest,
  type ConnectorTransportFamily,
} from "../src/connector/transports";
import type { Equal, Expect } from "./type-helpers";
import { utc } from "./branded";

// Compile-time: command requests REQUIRE idempotency keys and authorization.
export type AssertCommandShape = Expect<
  Equal<Required<Pick<ConnectorCommandRequest, "idempotencyKey" | "authorization">>, Pick<ConnectorCommandRequest, "idempotencyKey" | "authorization">>
>;

const REQUIRED_FAMILIES: readonly ConnectorTransportFamily[] = [
  "api-sdk",
  "rest",
  "graphql",
  "agent-protocol",
  "cli",
  "file-feed",
  "browser",
  "live-commerce",
  "physical-edge",
  "webhook",
];

const REQUIRED_IDS = [
  "api-sdk",
  "rest",
  "graphql",
  "mcp",
  "ucp",
  "acp",
  "a2a",
  "cli",
  "csv-feed",
  "xml-feed",
  "json-feed",
  "edi",
  "sftp-drop",
  "email-ingest",
  "webhook",
  "browser",
  "live-commerce-stream",
  "physical-edge",
];

describe("connector transport coverage", () => {
  it("covers every required transport family", () => {
    const families = new Set(CONNECTOR_TRANSPORTS.map((transport) => transport.family));
    for (const family of REQUIRED_FAMILIES) {
      expect(families.has(family), `missing transport family: ${family}`).toBe(true);
    }
  });

  it("has concrete descriptors for every required transport id", () => {
    const ids = new Set(CONNECTOR_TRANSPORTS.map((transport) => transport.id));
    for (const id of REQUIRED_IDS) {
      expect(ids.has(id), `missing transport id: ${id}`).toBe(true);
    }
  });

  it("marks inbound content as untrusted on every transport", () => {
    for (const transport of CONNECTOR_TRANSPORTS) {
      expect(transport.carriesUntrustedContent, transport.id).toBe(true);
      expect(transport.userLabel.length).toBeGreaterThan(0);
      expect(transport.description.length).toBeGreaterThan(0);
    }
  });

  it("supports no-API systems: browser, file feeds and physical edge can observe", () => {
    const byId = new Map(CONNECTOR_TRANSPORTS.map((transport) => [transport.id, transport]));
    for (const id of ["browser", "csv-feed", "edi", "sftp-drop", "email-ingest", "physical-edge"]) {
      const transport = byId.get(id);
      expect(transport, id).toBeDefined();
      expect(transport?.supportsObservations, id).toBe(true);
    }
    expect(byId.get("browser")?.supportsCommands).toBe(true);
    expect(byId.get("physical-edge")?.supportsCommands).toBe(true);
  });

  it("mirrors the three frozen execution modes as opaque refs", () => {
    expect(KNOWN_EXECUTION_MODES.map((mode) => mode.id)).toEqual([
      "PASS_THROUGH_NATIVE",
      "COMPOSED",
      "OPTIMIZED_MULTI_PROVIDER",
    ]);
  });

  it("gives every command request an idempotency key and authorization (fixture)", () => {
    const request: ConnectorCommandRequest = {
      requestId: "req-1",
      connectorId: "conn-1" as never,
      capabilityInstanceRef: "cci-1" as never,
      transportId: "rest",
      commandRef: "update-inventory",
      idempotencyKey: "req-1-key" as never,
      authorization: "authz-1" as never,
      requestedAt: utc("2026-10-05T02:34:37Z"),
    };
    expect(request.idempotencyKey).toBeDefined();
    expect(request.authorization).toBeDefined();
    expect(request.transportId).toBe("rest");
  });
});
