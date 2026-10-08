/**
 * Concrete ingestion parsers — webhook, CSV, XML-EDI, SFTP, email (W3-007 §3).
 *
 * Each parser turns a real-format sample into typed fields. A malformed
 * input returns per-field errors; a valid input returns a typed record.
 * Parsers are deterministic and stateless — the same input always
 * produces the same output.
 */

import type { IngestionParser } from "./ingestion-pipeline";
import type { IngestionFieldError } from "./ingestion-adversarial";

// ---------------------------------------------------------------------------
// CSV parser — order rows with required header columns
// ---------------------------------------------------------------------------

/** Required CSV columns for an order ingestion. */
export const CSV_ORDER_REQUIRED_COLUMNS: readonly string[] = [
  "order_id",
  "customer_email",
  "sku",
  "quantity",
  "unit_price",
  "currency",
];

/** Parse a CSV string into typed fields. */
export const csvParser: IngestionParser = (rawContent) => {
  const lines = rawContent.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) {
    return {
      ok: false,
      fieldErrors: [{ field: "csv", reason: "CSV must have a header row and at least one data row" }],
    };
  }
  const header = (lines[0] ?? "").split(",").map((cell) => cell.trim());
  const missingColumns = CSV_ORDER_REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    return {
      ok: false,
      fieldErrors: missingColumns.map((column) => ({
        field: column,
        reason: `missing required column ${column}`,
      })),
    };
  }
  const dataRow = (lines[1] ?? "").split(",").map((cell) => cell.trim());
  const fields: Record<string, string> = {};
  for (let index = 0; index < header.length; index += 1) {
    fields[header[index]!] = dataRow[index] ?? "";
  }
  // Validate required fields are non-empty.
  const fieldErrors: IngestionFieldError[] = [];
  for (const column of CSV_ORDER_REQUIRED_COLUMNS) {
    if (fields[column] === "" || fields[column] === undefined) {
      fieldErrors.push({ field: column, reason: "required field is empty" });
    }
  }
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, fields };
};

// ---------------------------------------------------------------------------
// XML / EDI parser — simplified XML document with required fields
// ---------------------------------------------------------------------------

/** Required XML element tags. */
export const XML_EDI_REQUIRED_TAGS: readonly string[] = [
  "OrderId",
  "CustomerId",
  "LineItem",
];

/** Parse a simplified XML string into typed fields. */
export const xmlEdiParser: IngestionParser = (rawContent) => {
  if (!rawContent.includes("<?xml") && !rawContent.startsWith("<Order")) {
    return {
      ok: false,
      fieldErrors: [{ field: "xml", reason: "expected an XML document with an <Order> root" }],
    };
  }
  const fieldErrors: IngestionFieldError[] = [];
  const fields: Record<string, string> = {};
  // Extract simple `<Tag>value</Tag>` pairs (no namespaces, no attributes).
  for (const tag of XML_EDI_REQUIRED_TAGS) {
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = pattern.exec(rawContent);
    if (match === null || match[1] === undefined || match[1].length === 0) {
      fieldErrors.push({ field: tag, reason: `missing <${tag}> value` });
    } else {
      fields[tag] = match[1].trim();
    }
  }
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, fields };
};

// ---------------------------------------------------------------------------
// SFTP parser — file drop manifest with required lines
// ---------------------------------------------------------------------------

/** Required SFTP manifest keys. */
export const SFTP_REQUIRED_KEYS: readonly string[] = [
  "manifest_id",
  "source_path",
  "file_count",
  "checksum",
];

/** Parse an SFTP manifest into typed fields. */
export const sftpParser: IngestionParser = (rawContent) => {
  // Manifest is a `key: value` line-oriented format.
  const lines = rawContent.split(/\r?\n/).filter((line) => line.includes(":"));
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key.length > 0 && value.length > 0) {
      fields[key] = value;
    }
  }
  const fieldErrors: IngestionFieldError[] = [];
  for (const key of SFTP_REQUIRED_KEYS) {
    if (fields[key] === undefined || fields[key] === "") {
      fieldErrors.push({ field: key, reason: `missing required manifest key ${key}` });
    }
  }
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, fields };
};

// ---------------------------------------------------------------------------
// Email parser — order confirmation with required headers
// ---------------------------------------------------------------------------

/** Required email headers. */
export const EMAIL_REQUIRED_HEADERS: readonly string[] = [
  "From",
  "Subject",
  "Order-Id",
];

/** Parse an email into typed fields. */
export const emailParser: IngestionParser = (rawContent) => {
  // Email is `Header: value\n\nbody`. Headers are required.
  const headerBlockEnd = rawContent.indexOf("\n\n");
  const headerBlock = headerBlockEnd === -1 ? rawContent : rawContent.slice(0, headerBlockEnd);
  const lines = headerBlock.split(/\r?\n/).filter((line) => line.includes(":"));
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key.length > 0 && value.length > 0) {
      fields[key] = value;
    }
  }
  const fieldErrors: IngestionFieldError[] = [];
  for (const header of EMAIL_REQUIRED_HEADERS) {
    if (fields[header] === undefined || fields[header] === "") {
      fieldErrors.push({ field: header, reason: `missing required email header ${header}` });
    }
  }
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, fields };
};

// ---------------------------------------------------------------------------
// Webhook parser — JSON-shaped event payload with required fields
// ---------------------------------------------------------------------------

/** Required webhook payload fields. */
export const WEBHOOK_REQUIRED_FIELDS: readonly string[] = [
  "event_id",
  "event_type",
  "occurred_at",
  "subject_ref",
];

/** Parse a webhook JSON payload into typed fields. */
export const webhookParser: IngestionParser = (rawContent) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      ok: false,
      fieldErrors: [{ field: "webhook", reason: "webhook payload is not valid JSON" }],
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      fieldErrors: [{ field: "webhook", reason: "webhook payload must be a JSON object" }],
    };
  }
  const fields: Record<string, string> = {};
  const obj = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      fields[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      fields[key] = String(value);
    } else if (value !== null && value !== undefined) {
      fields[key] = JSON.stringify(value);
    }
  }
  const fieldErrors: IngestionFieldError[] = [];
  for (const field of WEBHOOK_REQUIRED_FIELDS) {
    if (fields[field] === undefined || fields[field] === "") {
      fieldErrors.push({ field, reason: `missing required webhook field ${field}` });
    }
  }
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, fields };
};

/** Re-export the parser names for the contract tests. */
export const PARSERS = {
  csv: csvParser,
  xmlEdi: xmlEdiParser,
  sftp: sftpParser,
  email: emailParser,
  webhook: webhookParser,
} as const;
