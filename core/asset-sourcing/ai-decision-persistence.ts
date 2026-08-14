import { resolve } from 'node:path';
import {
  InvocationValidationError,
  requireAiAssetDecisionAuthorization,
  validateCurrentProjectRun,
  type ProjectRunInvocation,
} from '../runtime/invocation.ts';
import {
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import {
  AiAssetDecisionError,
  aiAssetDecisionAuthorityPayload,
  aiAssetDecisionFields,
  aiAssetDecisionRecordBytes,
  aiAssetDecisionRecordFor,
  aiAssetDecisionReferenceFor,
  aiAssetDecisionText,
  canonicalAiAssetDecision,
  failAiAssetDecision,
  hashAiAssetDecision,
  parseAiAssetDecisionRecord,
  parseAiAssetDecisionReference,
  sameAiAssetDecision,
  trustedAiAssetProjectRoot,
  type AiAssetDecisionBinding,
  type AiAssetDecisionInput,
  type AiAssetDecisionReference,
  type CommittedAiAssetDecision,
} from './ai-decision-domain.ts';

const fs = nodeStableProjectFileSystem();

function stableRead(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, '.omd', path), label, fs });
}

/** Builds bytes for a host authorization request; these bytes grant nothing without a host receipt. */
export function aiAssetDecisionAuthorityBytes(
  root: string,
  value: AiAssetDecisionInput,
  invocation: ProjectRunInvocation,
): Buffer {
  const record = aiAssetDecisionRecordFor(root, value, invocation);
  return aiAssetDecisionAuthorityPayload(record, aiAssetDecisionReferenceFor(record).decisionSha256);
}

/** Parses caller comparison data only. It does not establish commitment or currentness. */
export function parseAiAssetDecisionBinding(value: unknown): AiAssetDecisionBinding {
  try {
    const item = aiAssetDecisionFields(
      value,
      ['prompt', 'provider', 'decision', 'currentDecision'],
      'AI asset decision comparison',
    );
    return Object.freeze({
      prompt: aiAssetDecisionText(item.get('prompt'), 'AI asset prompt'),
      provider: aiAssetDecisionText(item.get('provider'), 'AI asset provider'),
      decision: parseAiAssetDecisionReference(
        item.get('decision'), 'AI asset decision reference',
      ),
      currentDecision: parseAiAssetDecisionReference(
        item.get('currentDecision'), 'caller current-decision comparison',
      ),
    });
  } catch (error) {
    if (error instanceof AiAssetDecisionError) throw error;
    return failAiAssetDecision('AI asset decision comparison could not be read safely');
  }
}

/** Commits one host-authorized immutable decision record and advances its current pointer. */
export function commitAiAssetDecision(
  root: string,
  value: AiAssetDecisionInput,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): AiAssetDecisionReference {
  try {
    const record = aiAssetDecisionRecordFor(root, value, invocation);
    const reference = aiAssetDecisionReferenceFor(record);
    requireAiAssetDecisionAuthorization(
      invocation,
      record.projectRoot,
      aiAssetDecisionAuthorityPayload(record, reference.decisionSha256),
    );
    const trusted = requireProjectWriteAdapterForInvocation(record.projectRoot, writer, invocation);
    trusted.writeContentAddressed(`.omd/${reference.record}`, aiAssetDecisionRecordBytes(record));
    trusted.write(
      `.omd/ai-asset-decisions/current/${reference.decisionId}.json`,
      `${canonicalAiAssetDecision(reference)}\n`,
    );
    requireCommittedAiAssetDecision(record.projectRoot, {
      prompt: record.prompt,
      provider: record.provider,
      decision: reference,
      currentDecision: reference,
    }, invocation);
    return reference;
  } catch (error) {
    if (error instanceof AiAssetDecisionError) throw error;
    const reason = error instanceof Error ? error.message : 'unknown authority failure';
    return failAiAssetDecision(`AI asset decision commit failed: ${reason}`);
  }
}

/** Reads and reauthorizes the current immutable record from the trusted project root. */
export function requireCommittedAiAssetDecision(
  root: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): CommittedAiAssetDecision {
  try {
    const trustedRoot = trustedAiAssetProjectRoot(root);
    const binding = parseAiAssetDecisionBinding(value);
    const activation = validateCurrentProjectRun(invocation);
    const exactInvocation = {
      buildSha256: activation.buildSha256,
      loadedSkillSha256: activation.loadedSkillSha256,
      briefSha256: activation.briefSha256,
    };
    if (!sameAiAssetDecision(binding.decision, binding.currentDecision)
      || binding.decision.projectRoot !== trustedRoot
      || !sameAiAssetDecision(binding.decision.invocation, exactInvocation)) {
      return failAiAssetDecision('caller decision comparison does not bind the trusted project and current invocation');
    }
    const pointerPath = `ai-asset-decisions/current/${binding.decision.decisionId}.json`;
    const pointerBytes = stableRead(trustedRoot, pointerPath, 'current AI asset decision pointer');
    const persistedReference = parseAiAssetDecisionReference(
      JSON.parse(pointerBytes.toString('utf8')),
      'persisted current AI asset decision',
    );
    if (!sameAiAssetDecision(persistedReference, binding.decision)
      || pointerBytes.toString('utf8') !== `${canonicalAiAssetDecision(persistedReference)}\n`) {
      return failAiAssetDecision('caller currentDecision is not the persisted current decision');
    }
    const bytes = stableRead(
      trustedRoot,
      persistedReference.record,
      'immutable AI asset decision record',
    );
    if (hashAiAssetDecision(bytes) !== persistedReference.decisionSha256) {
      return failAiAssetDecision('immutable AI asset decision bytes are stale or rewritten');
    }
    const record = parseAiAssetDecisionRecord(JSON.parse(bytes.toString('utf8')));
    if (bytes.toString('utf8') !== `${canonicalAiAssetDecision(record)}\n`
      || record.projectRoot !== trustedRoot
      || !sameAiAssetDecision(record.invocation, exactInvocation)
      || record.decisionId !== persistedReference.decisionId
      || record.prompt !== binding.prompt
      || record.provider !== binding.provider) {
      return failAiAssetDecision(
        'persisted AI asset decision does not match its project, invocation, prompt, or provider',
      );
    }
    requireAiAssetDecisionAuthorization(
      invocation,
      trustedRoot,
      aiAssetDecisionAuthorityPayload(record, persistedReference.decisionSha256),
    );
    if (!stableRead(
      trustedRoot, pointerPath, 'revalidated current AI asset decision pointer',
    ).equals(pointerBytes)
      || !stableRead(
        trustedRoot, persistedReference.record, 'revalidated immutable AI asset decision record',
      ).equals(bytes)) {
      return failAiAssetDecision('AI asset decision changed during authorization');
    }
    return Object.freeze({
      ...binding,
      decisionRecord: record,
      decisionSha256: persistedReference.decisionSha256,
    });
  } catch (error) {
    if (error instanceof AiAssetDecisionError) throw error;
    const reason = error instanceof InvocationValidationError
      ? error.reason
      : error instanceof Error ? error.message : 'unknown authority failure';
    return failAiAssetDecision(`AI asset decision authority rejected: ${reason}`);
  }
}
