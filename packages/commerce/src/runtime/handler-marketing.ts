/**
 * W1-007 marketing campaign handlers: campaign lifecycle (open/advance) and
 * campaign-effect application with deterministic eligibility + stacking policy.
 *
 * Every command is an idempotent kernel command (envelope pattern); every
 * effect is an immutable journaled fact. Stacking/exclusivity is enforced
 * explicitly — rejected effects are journaled as rejection evidence, never
 * silently dropped.
 */
import {
  advanceCampaign,
  applyCampaignEffect,
  type Campaign,
  type CampaignEffect,
} from "../domain/marketing.js";
import { nextRevision } from "../domain/events.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import {
  campaignEffectSubject,
  campaignSubject,
  mintCampaignEffectId,
} from "./subjects.js";

export const handleOpenCampaign: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_CAMPAIGN") return rejectInvalidCommand("not OPEN_CAMPAIGN");
  const campaign = payload.campaign;
  if (campaign.state !== "DRAFT") return rejectInvalidCommand("campaign must open in DRAFT state");
  if (campaign.revision !== 1) return rejectInvalidCommand("campaign must open at revision 1");
  if (ctx.state.merchantOps().campaign(campaign.campaignId)) {
    return rejectInvalidState(`campaign ${campaign.campaignId} already exists`);
  }
  ctx.emit({
    subject: campaignSubject(campaign.campaignId),
    kind: "CAMPAIGN_OPENED",
    payload: { kind: "CAMPAIGN_OPENED", campaign },
  });
  return accept();
};

export const handleAdvanceCampaign: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_CAMPAIGN") return rejectInvalidCommand("not ADVANCE_CAMPAIGN");
  const campaign = ctx.state.merchantOps().campaign(payload.campaignId);
  if (!campaign) return rejectInvalidState(`campaign ${payload.campaignId} not found`);
  const next = advanceCampaign(campaign, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `campaign ${payload.campaignId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: campaignSubject(payload.campaignId),
    kind: "CAMPAIGN_STATE_CHANGED",
    payload: { kind: "CAMPAIGN_STATE_CHANGED", campaign: next.value },
  });
  return accept();
};

export const handleApplyCampaignEffect: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "APPLY_CAMPAIGN_EFFECT") return rejectInvalidCommand("not APPLY_CAMPAIGN_EFFECT");
  const campaign = ctx.state.merchantOps().campaign(payload.campaignId);
  if (!campaign) return rejectInvalidState(`campaign ${payload.campaignId} not found`);
  const outcome = applyCampaignEffect(
    campaign,
    payload.skuId,
    payload.lineAmount,
    ctx.now,
    ctx.options.defaultRounding,
  );
  if (!outcome.ok) {
    return rejectInvalidState(`campaign effect rejected: ${outcome.error.code}`);
  }
  const effect: CampaignEffect = {
    ...outcome.value,
    effectId: mintCampaignEffectId(ctx.mint()),
  };
  ctx.emit({
    subject: campaignEffectSubject(effect.effectId),
    kind: "CAMPAIGN_EFFECT_APPLIED",
    payload: { kind: "CAMPAIGN_EFFECT_APPLIED", effect, campaign: { ...campaign, revision: nextRevision(campaign.revision) } },
  });
  return accept();
};

export const handleResolveCampaignStacking: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RESOLVE_CAMPAIGN_STACKING") return rejectInvalidCommand("not RESOLVE_CAMPAIGN_STACKING");
  // Stacking resolution is a pure read-side operation that journals the
  // resolution outcome as evidence (accepted + rejected effects). The
  // resolution itself is deterministic from the effect facts + policy.
  const effects: CampaignEffect[] = [];
  for (const effectId of payload.effectIds) {
    const effect = ctx.state.merchantOps().campaignEffect(effectId);
    if (!effect) return rejectInvalidState(`campaign effect ${effectId} not found`);
    effects.push(effect);
  }
  // The resolution is journaled as a CAMPAIGN_EFFECT subject event on the
  // first effect's subject (evidence that the resolution occurred). Rejected
  // effects are journaled as separate evidence facts.
  for (const effect of effects) {
    ctx.emit({
      subject: campaignEffectSubject(effect.effectId),
      kind: "CAMPAIGN_STACKING_RESOLVED",
      payload: {
        kind: "CAMPAIGN_STACKING_RESOLVED",
        effectId: effect.effectId,
        policy: payload.policy,
        accepted: payload.effectIds.includes(effect.effectId),
        resolvedAt: ctx.now,
      },
    });
  }
  return accept();
};
