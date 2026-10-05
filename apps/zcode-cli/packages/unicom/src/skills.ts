/**
 * @unicom/agent-kernel — skill registry and default specialization routing
 * (W2-002).
 *
 * Skills are the default specialization mechanism (invariants 3/4). The plane
 * keeps the contract `SkillDefinition` registry as the routing source of
 * truth and projects it onto the kernel's `SkillPort` so the real `Skill`
 * tool (registered by the kernel when a skill port is present) can load the
 * specialization in a real turn. Default specialization routing is
 * deterministic: the first enabled skill whose capability set covers the
 * needed capability definition.
 */

import type { SkillDefinition, SkillReference } from "@unicom/agent";
import type {
  SkillContent,
  SkillDiscoverRequest,
  SkillLoadOutcome,
  SkillLoadRequest,
  SkillMetadata,
  SkillOperationOptions,
  SkillPort,
} from "@zcode/contracts";
import type { ToolContract } from "@unicom/agent";

export interface UnicomSkillRegistryOptions {
  readonly skills?: readonly SkillDefinition[];
  readonly tools?: readonly ToolContract[];
}

export class UnicomSkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly tools = new Map<string, ToolContract>();
  private readonly enabled = new Map<string, boolean>();

  constructor(options: UnicomSkillRegistryOptions = {}) {
    for (const skill of options.skills ?? []) this.registerSkill(skill);
    for (const tool of options.tools ?? []) this.tools.set(tool.toolId, tool);
  }

  registerSkill(skill: SkillDefinition, enabled = true): void {
    this.skills.set(skill.skillId, skill);
    this.enabled.set(skill.skillId, enabled);
  }

  setEnabled(skillId: string, enabled: boolean): void {
    if (this.skills.has(skillId)) this.enabled.set(skillId, enabled);
  }

  listSkills(): readonly SkillDefinition[] {
    return [...this.skills.values()];
  }

  enabledSkillReferences(): readonly SkillReference[] {
    return [...this.skills.values()]
      .filter((skill) => this.enabled.get(skill.skillId) === true)
      .map((skill) => ({ skillId: skill.skillId, enabled: true }));
  }

  findSkill(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  /** Default specialization routing: enabled skill covering the capability. */
  defaultSkillForCapability(capabilityDefinitionId: string): SkillDefinition | undefined {
    for (const skill of this.skills.values()) {
      if (this.enabled.get(skill.skillId) !== true) continue;
      if (skill.capabilityDefinitionIds.includes(capabilityDefinitionId)) return skill;
    }
    return undefined;
  }

  /** Tool ids a skill brings (default specialization's toolset). */
  toolIdsForSkill(skillId: string): readonly string[] {
    return this.skills.get(skillId)?.toolIds ?? [];
  }

  /** Project the contract registry onto the kernel SkillPort (real Skill tool). */
  toKernelSkillPort(): SkillPort {
    const listSkillMetadata = this.listSkillMetadata.bind(this);
    const loadSkillContent = this.loadSkillContent.bind(this);
    const skillCount = this.skills.size;
    return {
      discoverSkills: async (
        _request: SkillDiscoverRequest,
        _options?: SkillOperationOptions,
      ): Promise<SkillLoadOutcome> => ({
        skills: listSkillMetadata(),
        diagnostics: [],
        totalDiscovered: skillCount,
      }),
      loadSkill: async (request: SkillLoadRequest) => loadSkillContent(request.name),
    };
  }

  private loadSkillContent(name: string): SkillContent {
    const skill = this.resolveByName(name);
    if (!skill) {
      throw new Error(`unicom skill not found: ${name}`);
    }
    const content = [
      `# Skill: ${skill.name}`,
      skill.description ? `> ${skill.description}` : "",
      "",
      "## Capabilities",
      ...skill.capabilityDefinitionIds.map((id) => `- ${id}`),
      "",
      "## Tools",
      ...skill.toolIds.map((id) => `- ${id}`),
    ]
      .filter((line) => line !== "")
      .join("\n");
    const metadata = this.toSkillMetadata(skill);
    return {
      metadata,
      content,
      baseDirectory: metadata.directory,
      bytesRead: content.length,
      sizeBytes: content.length,
      truncated: false,
    };
  }

  private resolveByName(name: string): SkillDefinition | undefined {
    return this.skills.get(name) ?? this.findByDisplayName(name);
  }

  private findByDisplayName(name: string): SkillDefinition | undefined {
    const lowered = name.toLowerCase();
    return [...this.skills.values()].find(
      (skill) => skill.name.toLowerCase() === lowered || skill.skillId.toLowerCase() === lowered,
    );
  }

  private listSkillMetadata(): SkillMetadata[] {
    return [...this.skills.values()].map((skill) => this.toSkillMetadata(skill));
  }

  private toSkillMetadata(skill: SkillDefinition): SkillMetadata {
    return {
      name: skill.skillId,
      description: skill.description ?? skill.name,
      ...(skill.description ? { whenToUse: skill.description } : {}),
      qualifiedName: skill.skillId,
      path: `/unicom/skills/${skill.skillId}/SKILL.md`,
      directory: `/unicom/skills/${skill.skillId}`,
      rootPath: "/unicom/skills",
      scope: "system",
      source: "bundled",
      safeToAutoLoad: this.enabled.get(skill.skillId) === true,
      frontmatterKeys: ["name", "description"],
    };
  }
}
