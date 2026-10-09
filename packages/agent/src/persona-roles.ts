/**
 * W2-009 — Industry role tables (specialist titles, family titles,
 * seniority draw, role-permission scopes).
 *
 * Split out of persona-cohort.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module — not exported through the contract
 * surface. The persona generator consumes these tables.
 */

import type { SeededRandom } from "./sim-random.js";
import type {
  Industry,
  RoleFamily,
  Seniority,
  FirmSize,
} from "./persona-types.js";

const INDUSTRY_SPECIALIST_TITLES: Readonly<Record<Industry, ReadonlyArray<string>>> = {
  construction: ["Site Superintendent", "Materials Coordinator", "Trade Buyer"],
  finance: ["Vendor Master Analyst", "Expense Approver", "Treasury Operations"],
  sales: ["B2B Account Manager", "Storefront Operator", "Channel Lead"],
  technology: ["IT Asset Manager", "License Administrator", "Procurement Engineer"],
  healthcare: ["Materials Management Supervisor", "Recall Coordinator", "Clinical Supply Buyer"],
  transportation: ["Depot Parts Manager", "Fleet Maintenance Lead", "Yard Coordinator"],
  hospitality: ["F&B Director", "Banquet Buyer", "Housekeeping Supply Lead"],
  fashion: ["Wholesale Buyer", "Merchandise Planner", "Apparel Sourcing Lead"],
  entertainment: ["Equipment Coordinator", "Wardrobe/Props Buyer", "Crew Procurement"],
  legal: ["Practice Operations Manager", "Vendor Relationship Coordinator", "Knowledge Manager"],
  defense: ["Contracting Officer (KO)", "Logistics Specialist", "Procurement Analyst"],
  manufacturing: ["BOM Planner", "Supplier Quality Engineer", "Production Buyer"],
  supermarket: ["Store Manager", "Perishables Buyer", "Front-End Lead"],
};

const ROLE_FAMILY_TITLES: Readonly<Record<RoleFamily, string>> = {
  procurement: "Procurement Specialist",
  "project-program-mgmt": "Project Manager",
  "field-ops": "Operations Lead",
  "finance-accounting": "Finance Analyst",
  sales: "Sales Representative",
  it: "IT Coordinator",
  "compliance-audit": "Compliance Auditor",
  "approver-executive": "Approver / Executive",
  "industry-specialist": "Industry Specialist",
};

export function roleTitleFor(
  industry: Industry,
  roleFamily: RoleFamily,
  index: number,
): string {
  if (roleFamily === "industry-specialist") {
    const specialists = INDUSTRY_SPECIALIST_TITLES[industry];
    return specialists[index % specialists.length]!;
  }
  return ROLE_FAMILY_TITLES[roleFamily]!;
}

export function seniorityFor(
  roleFamily: RoleFamily,
  _index: number,
  firmSize: FirmSize,
  rng: SeededRandom,
): Seniority {
  // Executives and approvers are concentrated in smaller firms (flatter
  // hierarchies); larger firms have more individual contributors.
  const executivePct = firmSize === "small" ? 0.2 : firmSize === "medium" ? 0.08 : 0.02;
  const directorPct = firmSize === "small" ? 0.2 : firmSize === "medium" ? 0.12 : 0.06;
  const managerPct = firmSize === "small" ? 0.3 : firmSize === "medium" ? 0.3 : 0.22;
  const draw = rng.nextUint32() / 0x1_0000_0000;
  if (roleFamily === "approver-executive") {
    return draw < 0.5 ? "executive" : draw < 0.85 ? "director" : "manager";
  }
  if (draw < executivePct) return "executive";
  if (draw < executivePct + directorPct) return "director";
  if (draw < executivePct + directorPct + managerPct) return "manager";
  return "individual";
}

export function rolePermissionsFor(
  industry: Industry,
  roleFamily: RoleFamily,
  seniority: Seniority,
): string[] {
  const base: string[] = [`commerce:read:${industry}`];
  switch (roleFamily) {
    case "procurement":
      base.push("commerce:purchase:request", "commerce:quote:compare");
      if (seniority === "manager" || seniority === "director" || seniority === "executive") {
        base.push("commerce:purchase:approve:up-to-medium");
      }
      if (seniority === "director" || seniority === "executive") {
        base.push("commerce:purchase:approve:up-to-large");
      }
      break;
    case "approver-executive":
      base.push(
        "commerce:purchase:approve:any",
        "commerce:budget:read",
        "commerce:policy:write",
      );
      break;
    case "compliance-audit":
      base.push("commerce:audit:read", "commerce:dispute:read", "commerce:evidence:read");
      break;
    case "finance-accounting":
      base.push("commerce:invoice:read", "commerce:budget:read", "commerce:reconcile:write");
      break;
    case "sales":
      base.push("commerce:catalog:read", "commerce:order:write", "commerce:quote:write");
      break;
    case "it":
      base.push("commerce:connector:configure", "commerce:integration:read");
      break;
    case "field-ops":
      base.push("commerce:inventory:read", "commerce:receiving:write");
      break;
    case "project-program-mgmt":
      base.push("commerce:purchase:request", "commerce:budget:read");
      break;
    case "industry-specialist":
      base.push(`commerce:specialist:${industry}`);
      break;
  }
  return base;
}
