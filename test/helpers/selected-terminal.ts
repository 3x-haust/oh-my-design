import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { fixture, renderedSet, userChoice, type Fixture } from './phase6-process.ts';
import { publishTestAdaptiveRoute, createTestProjectWriteAdapter, authorizeTestProjectRunPayloads } from './project-write.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../../core/route/adaptive-route-persistence.ts';
import { candidateContentProjection } from '../../core/brief/candidate-plan.ts';
import { publishCandidatePacket, publishCandidateSelection } from '../../core/brief/candidate-choice.ts';
import { publishSelectedArtDirection, selectedArtDirectionInput, selectedArtCopyProjection, readSelectedArtDirection } from '../../core/art-direction/selected.ts';
import { resolveSelectedTokens } from '../../core/tokens/resolve.ts';
import { CURRENT_COMPOSITION_SECTIONS } from '../../core/composition-contract/index.ts';
import { servedProjectTreeSha256 } from '../../core/render/serve.ts';
import { writeSourceSeal } from '../../core/source-seal/index.ts';
import { writeBrowserDecisionFixture } from './browser-observation-decision-links.ts';
import { deriveTrustedEvaluationIdentity, deriveTrustedDecisionRefs, parseTrustedLifecycleManifest } from '../../core/runtime/trusted-evaluation-contract.ts';
import { validateDecisionGraph } from '../../core/deliberation/contracts.ts';
import { runTrustedBrowserEvaluation } from '../../adapters/trusted-browser-runner.ts';
import { writeTrustedEvaluationObservation } from '../../core/runtime/trusted-evaluation-observation.ts';
import { observationV2Sha256 } from '../../core/runtime/observation.ts';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import { canonicalBytes, digest, sha256 } from '../../core/measure/identity.ts';
import { write, measuredTerminalCopy, testPurposeAuthority } from './measured-terminal.ts';
import { captureMeasuredSlopCheckpoint, publishMeasuredSlopReview } from '../../core/slop/measured-review.ts';

export async function selectedTerminalFixture(t: { after(fn: () => void): void }, options: { beats?: boolean } = {}) {
  const base = fixture(t), root = base.root;
  const input = JSON.parse(readFileSync(new URL('../fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  input.processPolicy = { schema: 'human-design-process-v1', interactionMode: 'interactive', autonomyGrant: null };
  input.reviewPurpose = 'ordinary'; input.reviewPurposeAuthority = testPurposeAuthority(root, 'ordinary', input.request);
  input.strategyDecision.roles.push('omd-framer', 'omd-art-director', 'omd-sketch', 'omd-typesetter', 'omd-composer');
  input.strategyDecision.methods.push('concept-exploration');
  input.strategyDecision.attributionCategories = ['tokens', 'composition'];
  input.strategyDecision.stages = ['domain', 'frame', 'copy', 'candidate-generation', 'art-direction', 'type-proof', 'composition', 'production', 'browser-evidence', 'independent-review'];
  input.strategyDecision.skips = input.strategyDecision.skips.filter((s: { id: string }) => !input.strategyDecision.stages.includes(s.id));
  input.strategyDecision.executionWaves = [{ id: 'frame', mode: 'concurrent', roles: ['omd-framer'] }, { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
    { id: 'concepts', mode: 'concurrent', roles: ['omd-art-director', 'omd-sketch'] }, { id: 'type', mode: 'concurrent', roles: ['omd-typesetter'] },
    { id: 'compose', mode: 'concurrent', roles: ['omd-composer'] }, { id: 'production', mode: 'concurrent', roles: ['omd-hand'] }, { id: 'review', mode: 'concurrent', roles: ['omd-eye'] }];
  const invocation = publishTestAdaptiveRoute(root, input), writer = createTestProjectWriteAdapter(root, invocation), route = readPersistedRoute(root, invocation);
  const surfacePlan = { ...base.frame.surfacePlan, surfaces: [{ ...base.frame.surfacePlan.surfaces[0]!, purpose: 'Read the approved confirmation and supporting order details.' }] };
  const frame = { ...base.frame, surfacePlan, uxTask: 'Review confirmation', uxFrequentAction: 'Read the receipt', uxCostliestError: 'Mistaking a local confirmation for delivery',
    reality: { schema: 'reality-ledger-v1' as const, mode: 'existing' as const, facts: [{ category: 'subject', status: 'supplied', statement: 'Existing order confirmation' }] } };
  write(root, '.omd/frame.md', `---\n${stringify({ uxSurface: 'marketing', uxTask: frame.uxTask, uxFrequentAction: frame.uxFrequentAction, uxCostliestError: frame.uxCostliestError,
    reality: frame.reality, surfacePlan, validationPlan: frame.validationPlan, accessibilityPlan: frame.accessibilityPlan })}---\nRead the actual order confirmation and its supporting details.\n`);
  const content = { ...base.content, facts: ['An existing order confirmation is supplied.'], truthBoundary: 'Local receipt display, not proof of delivery.', units: Array.from({ length: 16 }, (_, i) => ({ id: `unit-${i}`, roleId: 'body', text: i === 0 ? 'Approved confirmation sentence.' : `Item ${i}. Review the recorded quantities and delivery details on your order receipt. Keep this record available while checking the items listed below.` })) };
  write(root, '.omd/.cache/sketches/content.json', JSON.stringify(content));
  const plan = { ...base.plan, sourceContractSha256: route.sourceContractSha256, content: { ...base.plan.content, contentIds: content.units.map(u => u.id),
    projectionSha256: candidateContentProjection(root, content) } };
  const contentBytes = readFileSync(join(root, '.omd/.cache/sketches/content.json'));
  plan.content.receipt = { path: '.omd/.cache/sketches/content.json', sha256: sha256(contentBytes) };
  const f: Fixture = { ...base, root, invocation, writer, route, input, frame, content, plan };
  const set = await renderedSet(f), presented = publishCandidatePacket(root, set, writer, invocation);
  publishCandidateSelection(root, userChoice(f, presented), writer, invocation);
  const chosen = selectedArtDirectionInput(root);
  const art = publishSelectedArtDirection(root, { schema: 'art-direction-input-v3', candidateSelection: chosen.candidateSelection, selectedId: chosen.selectedId,
    register: 'content-led', relationship: chosen.hypothesis.relationship, staticContract: { hierarchy: 'Read the confirmation before reviewing the supporting order details.', density: 'Keep the complete order details, without an empty decorative stage.', typography: 'Use the chosen readable body treatment.', preserve: ['Retain every supplied content unit.'], falsifiers: ['The confirmation cannot be found in either viewport.'] },
    metaphorQualities: [], literalPropsToReject: [], motion: { decision: 'none', settlement: null, evaluatorAssessment: null, evaluatorResult: null }, implementationLane: 'CSS', fallbackPath: 'Keep one readable column.', performanceAccessibilityBudget: 'No motion or external assets; preserve readable contrast.', beatIds: options.beats ? ['B-1'] : [] }, writer, invocation);
  const entry = 'src/copy/final.html';
  let html = readFileSync(join(root, `.omd/.cache/sketches/${chosen.selectedId}/index.html`), 'utf8');
  html = html.replace('<p data-omd-content-id="unit-0"', '<button type="button" data-omd-content-id="unit-0"').replace('Approved confirmation sentence.</p>', 'Approved confirmation sentence.</button>')
    .replace('</style>', 'button{display:block;font:inherit;text-align:left;color:inherit;background:transparent;border:0;padding:0;margin:0 0 24px;max-width:100%}</style>');
  if (options.beats) html = html.replace('<button type="button"', '<section data-omd-beat="B-1"><button type="button"').replace('</button>', '</button></section>');
  write(root, entry, html);
  const selected = readSelectedArtDirection(root, route.sourceContractSha256), tokens = resolveSelectedTokens(root);
  write(root, '.omd/copy-deck.md', `${measuredTerminalCopy}\n## Selected direction\n\n\`\`\`json\n${JSON.stringify(selectedArtCopyProjection(selected))}\n\`\`\`\n`);
  const evidence = [{ status: 'user-provided', reference: 'request' }], statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: route.request }] });
  write(root, '.omd/domain-brief.json', canonicalBytes({ schema: 'domain-brief-v1', request: route.request, domain: 'Order confirmation', summary: 'Read the existing order confirmation.',
    surfaces: [{ name: 'Main', purpose: 'Read confirmation', evidence }], coreObjects: [{ name: 'Order', evidence }], audience: { description: 'People reviewing orders', evidence }, referenceQueries: { component: ['order receipt'], craft: ['readable type'], mood: ['quiet workspace'] },
    planning: { businessGoal: statement('Correct the approved confirmation'), successSignal: statement('Read the approved sentence'), nonGoals: [statement('No delivery claim')] } }));
  const revision = `## Production revision binding\n- Production entry: \`${entry}\`\n- Production revision SHA-256: \`${servedProjectTreeSha256(root, entry)}\`\n`;
  const type = { schema: 'type-proof-contract-v1', families: [{ id: 'system', stack: ['system-ui'] }], roles: [{ id: 'body', familyId: 'system', size: 16, weights: [400], leading: 1.5, minimumReadablePx: 16, required: true }], assignments: [{ selector: '[data-omd-text-style]', role: 'body' }], defaultTextRole: 'body', requiredViews: [] };
  write(root, '.omd/type-proof.md', `${revision}\n## Measurement contract\n\n\`\`\`json\n${JSON.stringify(type)}\n\`\`\`\n`);
  const fingerprint = [['Frame', sha256(readFileSync(join(root, '.omd/frame.md')))], ['Copy deck', sha256(readFileSync(join(root, '.omd/copy-deck.md')))], ['Type proof', sha256(readFileSync(join(root, '.omd/type-proof.md')))], ['Art direction record', art.record.sha256], ['Candidate selection', selected.decision.candidateSelection.sha256], ['Effective tokens', tokens.effectiveTokensSha256], ['Scout', 'N/A \u2014 The existing copy task has no new reference acquisition.']].map(([key, value]) => `- ${key} SHA-256: ${value}`).join('\n');
  const colors = '| Dominant | #ffffff | Canvas |\n| Secondary | #111111 | Reading text |\n| Accent | #111111 | primary action |\n| Semantic success | #111111 | Text status |\n| Semantic error | #111111 | Text error |';
  const composition = CURRENT_COMPOSITION_SECTIONS.map(h => `## ${h}\n${h === 'Input fingerprint' ? fingerprint : h === 'Colour roles' ? colors : 'Preserve the chosen adjacent reading relationship and the complete supplied receipt content.'}\n`).join('\n');
  const blocks = { 'Needed components': { schema: 'needed-components-v1', components: [{ id: 'details', users: [{ surfaceId: 'main', stateId: 'initial' }], variants: [], tokenRoles: ['body'], sizing: 'Fluid columns within the readable page width.', overflow: 'Wrap text and use normal document scrolling.', reuse: { componentId: null, reason: 'One actual receipt-reading component.' } }] },
    'Expansion mapping': { schema: 'surface-expansion-v1', cells: surfacePlan.views.map(view => ({ surfaceId: 'main', stateId: 'initial', viewId: view.id, route: '/final.html', state: 'initial', stateRecipeSha256: digest({ state: 'initial' }) })) },
    'Measurement contract': { schema: 'composition-measurement-contract-v1', frequentAction: 'button', regions: [], colors: [{ role: 'canvas', selector: 'body', property: 'background', value: '#ffffff', token: null }], spacing: null, relationships: [], requiredViews: [] } };
  write(root, '.omd/composition.md', `${composition}\n${revision}\n${Object.entries(blocks).map(([heading, value]) => `## ${heading}\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`).join('\n')}`);
  writeBrowserDecisionFixture(root);
  const graphBytes = readFileSync(join(root, '.omd/decision-graph.json')), decisions = validateDecisionGraph(JSON.parse(graphBytes.toString('utf8'))).value!;
  write(root, '.omd/build.json', canonicalBytes({ schemaVersion: 'omd-build-identity-v1', packageVersion: '1', buildSha256: invocation.current.buildSha256, sourceSkillSha256: invocation.current.loadedSkillSha256 }));
  writeSourceSeal(root, invocation);
  const identity = deriveTrustedEvaluationIdentity({ sourceContractSha256: route.sourceContractSha256, taskOutcome: route.sourceContract.taskOutcome, evidenceClaims: route.sourceContract.evidenceClaims, allowedPaths: route.allowedPaths, entryPath: entry });
  const evaluation = await runTrustedBrowserEvaluation({ root, manifest: parseTrustedLifecycleManifest({ schema: 'trusted-lifecycle-manifest-v1', entryPath: entry, scripts: identity.requiredOutcomeRefs.map(outcomeRef => ({ outcomeRef, actions: [], assertions: [{ kind: 'visible-text', selector: 'button', text: 'Approved confirmation sentence.' }] })) }),
    binding: { runId: 'selected-terminal', routeSha256: adaptiveRouteRecordSha256(route), sourceContractSha256: route.sourceContractSha256, activationBuildSha256: invocation.current.buildSha256, productionRevisionSha256: servedProjectTreeSha256(root, entry), productionPath: entry, decisionGraphSha256: sha256(graphBytes), requiredOutcomeRefs: identity.requiredOutcomeRefs, confirmedClaimRefs: identity.confirmedClaimRefs, decisionRefs: deriveTrustedDecisionRefs(route.sourceContractSha256, decisions.decisions) },
    artifacts: { write: (path, bytes) => writer.writeContentAddressed(path, bytes) } });
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'product-probe-result', payload: Buffer.from(`${canonicalJson(evaluation.receipt)}\n`) }]);
  const observation = writeTrustedEvaluationObservation({ root, writer, invocation, evaluation, currentArtifactPath: '.omd/build.json', productionArtifactPath: entry, requireDecisionGraph: true });
  const measurements = [...new Map(evaluation.receipt.captures.map(c => [c.measurement!.packet.sha256, c.measurement!.packet])).values()];
  write(root, '.omd/surface-captures.json', canonicalBytes({ schema: 'surface-capture-inventory-v1', captures: evaluation.receipt.captures.filter(c => c.measurement!.state === 'initial').map(c => ({ surfaceId: 'main', stateId: 'initial', viewId: c.measurement!.viewId, packet: c.measurement!.packet, capture: { path: `.omd/visual-measurement-captures/sha256-${c.sha256}.png`, sha256: c.sha256 } })), contentProofs: [] }));
  const checkpoint = captureMeasuredSlopCheckpoint(root, { schema: 'slop-measured-scope-v2', measurements }, writer, invocation);
  if (checkpoint.findings.length) throw new Error(`selected terminal fixture has native findings: ${JSON.stringify(checkpoint.findings.map(f => f.rule))}`);
  publishMeasuredSlopReview(root, { ...checkpoint.reviewInput, summary: 'Inspected the exact selected receipt surface in each native view.' }, writer, invocation);
  return { root, invocation, writer, route, entry, art, tokens, evaluation, observation, measurements, observationSha256s: [observationV2Sha256(observation)] };
}
