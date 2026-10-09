/**
 * W1-009 portfolio — per-industry project-template DATA merger.
 *
 * Merges the four group files (templates-data-1..4.ts) into the single
 * TEMPLATES_BY_INDUSTRY record consumed by the builder in `templates.ts`.
 *
 * Split from the original templates-data.ts to comply with the
 * architecture-policy max-file-lines (400) rule. Each group file holds
 * the template data for 3-4 industries.
 *
 * Commerce-only scope (per W1-009 work-order clarification): no general PM,
 * engineering design, clinical care, dispatch, creative production, legal
 * matter-management or classified operations. Only the commerce inside the
 * industry project.
 */
import type { TemplateSeed } from "./templates-data-1.js";
import { TEMPLATES_GROUP_1 } from "./templates-data-1.js";
import { TEMPLATES_GROUP_2 } from "./templates-data-2.js";
import { TEMPLATES_GROUP_3 } from "./templates-data-3.js";
import { TEMPLATES_GROUP_4 } from "./templates-data-4.js";

export type { TemplateSeed } from "./templates-data-1.js";

export const TEMPLATES_BY_INDUSTRY: Readonly<Record<string, readonly TemplateSeed[]>> = {
  ...TEMPLATES_GROUP_1,
  ...TEMPLATES_GROUP_2,
  ...TEMPLATES_GROUP_3,
  ...TEMPLATES_GROUP_4,
};

export function templatesForIndustry(industryId: string): readonly TemplateSeed[] {
  const templates = TEMPLATES_BY_INDUSTRY[industryId];
  if (!templates || templates.length === 0) {
    throw new TypeError(`no templates defined for industry: ${industryId}`);
  }
  return templates;
}
