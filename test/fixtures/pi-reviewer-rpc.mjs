import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const mode = process.env.PI_REVIEWER_FIXTURE_MODE ?? 'success';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const provider = option('--provider');
const model = option('--model');
if (args.includes('--thinking')) throw new Error('Reviewer must not persist a CLI thinking override');
const parentThinkingLevel = 'medium';
let thinkingLevel = parentThinkingLevel;
let scopedThinkingConfigured = false;
const sessionId = randomUUID();
const messages = [];
let ready = false;
let settled = false;
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const trace = event => {
  if (process.env.PI_REVIEWER_FIXTURE_TRACE) {
    appendFileSync(process.env.PI_REVIEWER_FIXTURE_TRACE, `${JSON.stringify({ event, pid: process.pid, sessionId })}\n`);
  }
};
const response = (request, data) => emit({ type: 'response', id: request.id, command: request.type, success: true, data });
const systemPrompt = readFileSync(option('--system-prompt'), 'utf8');
const directoryPrompt = `${systemPrompt}\nCurrent working directory: ${process.cwd().replaceAll('\\', '/')}\n`;
const sha256 = value => createHash('sha256').update(value).digest('hex');

for (const flag of ['--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--no-tools']) {
  if (!args.includes(flag)) throw new Error(`Reviewer isolation flag missing: ${flag}`);
}
if (option('--mode') !== 'rpc' || option('--append-system-prompt') !== '') throw new Error('Reviewer prompt isolation is incomplete');

function emitReady() {
  if (ready) return;
  ready = true;
  if (mode === 'no-ready') {
    trace('ready-omitted');
    process.stdout.write('', () => process.exit(0));
    return;
  }
  trace('ready');
  emit({
    type: 'omd_reviewer_ready', sessionId, provider, model, thinkingLevel: parentThinkingLevel,
    tools: mode === 'extra-tool' ? ['read_reviewer_evidence', 'bash'] : ['read_reviewer_evidence'],
    systemPromptSha256: sha256(mode === 'ambient-system' ? `${systemPrompt}\nAmbient project guidance`
      : mode === 'wrong-cwd-prompt' ? `${systemPrompt}\nCurrent working directory: ${process.cwd()}/unowned\n`
      : mode === 'cwd-extra-guidance' ? `${directoryPrompt}Ambient project guidance`
      : mode === 'bare-system-prompt' ? systemPrompt : directoryPrompt),
    modelMessageCount: mode === 'prehistory' ? 1 : 0,
  });
}

function handback(packet) {
  const contract = packet.outputContract;
  if (contract.lane === 'candidateFidelity') {
    const revise = mode === 'candidate-revise' || mode === 'candidate-source-payload';
    const counterparts = contract.responseTemplate.referenceFidelityAssessments.map(row => {
      const matches = packet.evidence.referenceFidelityExpectations.filter(binding =>
        binding.slotId === row.slotId && binding.viewport === row.viewport);
      const state = row.slotId === 'hero-card' ? 'collapsed-list' : 'expanded-editor';
      const target = packet.evidence.renders.find(render => render.state === state && render.viewport === row.viewport);
      return matches.find(binding => binding.targetCaptureSha256 === target?.captureSha256) ?? matches.at(-1);
    });
    return {
      schema: contract.schema, fixedBindings: contract.fixedBindings,
      decision: revise ? 'revise' : 'retain',
      referenceFidelityAssessments: counterparts.map(binding => ({
        ...binding, verdict: revise ? 'fail' : 'pass', recognizable: !revise,
        sourceVisualCharacter: 'An inset work area with unruled groups.',
        targetVisualCharacter: revise ? 'Unrelated repeated ruled containers.' : 'An inset work area with unruled groups.',
        preservedTraits: revise ? [] : ['Inset grouping and relative proportions'],
        departures: [], rationale: 'Offline fixture tests binding and refusal, not aesthetic quality.',
      })),
      repairCriteria: revise ? counterparts.map(binding => ({
        slotId: binding.slotId, viewport: binding.viewport,
        observation: 'Repeated ruled containers replace the selected grouping.',
        repairCriterion: mode === 'candidate-source-payload'
          ? 'Use https://source.example/original.png'
          : 'Restore the inset work area and unruled grouping.',
      })) : [],
      continuity: (mode === 'candidate-drop-history' ? [] : packet.evidence.priorReview?.assessments ?? []).map(prior => ({
        slotId: prior.slotId, viewport: prior.viewport,
        previousCaptureSha256: prior.targetCaptureSha256,
        currentCaptureSha256: counterparts.find(row => row.slotId === prior.slotId
          && row.viewport === prior.viewport).targetCaptureSha256,
        disposition: prior.verdict === 'pass' ? revise ? 'regressed' : 'preserved' : revise ? 'unresolved' : 'resolved',
        observation: 'The current counterpart was checked against its earlier visible criterion.',
      })),
    };
  }
  if (contract.lane === 'firstRender') {
    const revise = mode === 'early-revise' || mode === 'early-reframe';
    const reframe = mode === 'early-reframe';
    return {
      schema: contract.schema, fixedBindings: contract.fixedBindings,
      decision: mode === 'early-reframe' ? 'reframe' : revise ? 'revise' : 'retain',
      qualityAssessments: mode === 'early-missing-quality' ? [] : contract.qualityAxes.flatMap(axis => packet.evidence.renders.map(render => ({
        axis, viewport: render.viewport, captureSha256: render.captureSha256,
        verdict: reframe ? ['beautyDesirability', 'hierarchyComposition'].includes(axis) ? 'fail' : 'pass'
          : revise && axis === 'usability' && render.viewport === 'mobile' ? 'fail' : 'pass',
        observation: 'Offline fixture tests the capture-bound contract, not aesthetic quality.',
        consequence: 'The fixture checks complete axis coverage.',
      }))),
      findings: reframe ? ['beautyDesirability', 'hierarchyComposition'].map(axis => ({
        id: axis, viewport: 'both', axis, repairScope: 'composition',
        observation: 'The current grouping loses the intended work-object hierarchy.',
        consequence: 'The surface does not convey the approved relationship.',
        repairCriterion: 'Make the work-object hierarchy legible in the intended visual direction.',
      })) : revise ? [{
        id: 'primary-action', viewport: 'mobile', axis: 'usability', repairScope: mode === 'early-reframe' ? 'composition' : 'surface',
        observation: 'Primary action label wraps.',
        consequence: 'The action is hard to read.', repairCriterion: 'Keep the complete action label readable.',
      }] : [],
      resolvedFindings: revise ? [] : packet.evidence.priorCriteria.map(finding => ({
        id: finding.id, evidence: packet.evidence.renders
          .filter(render => finding.viewport === 'both' || finding.viewport === render.viewport)
          .map(render => ({ viewport: render.viewport, captureSha256: render.captureSha256,
            observation: 'The current action label is readable without wrapping.' })),
      })),
    };
  }
  if (contract.schema === 'reference-zone-reviewer-handback-v1') {
    return {
      ...contract.responseTemplate,
      admission: {
        ...contract.responseTemplate.admission,
        visualQuality: 'excellent',
        visualEvidence: 'The complete populated surface has clear alignment and deliberate hierarchy.',
        relationshipCompatibility: 'compatible',
        relationshipEvidence: 'The visible information relationships fit the named static zone.',
        verdict: 'zone-compatible',
      },
    };
  }
  if (contract.lane === 'referenceAdmission') {
    const verdict = mode === 'reference-support' || mode === 'reference-ordinary-support' ? 'support'
      : mode === 'reference-reject' ? 'reject' : 'direction';
    const captureType = mode === 'reference-documentation-wrapper-direction' ? 'documentation-help-wrapper'
      : mode === 'reference-promotional-wrapper-direction' ? 'changelog-promotional-wrapper'
      : mode === 'reference-finished-website' ? 'finished-website'
      : mode === 'reference-ordinary-support' ? 'finished-product-task-screen'
      : verdict === 'support' ? 'isolated-component-detail'
      : verdict === 'reject' ? 'blocked-or-loading-content' : 'finished-product-task-screen';
    return {
      schema: contract.schema,
      lane: contract.lane,
      ...contract.fixedBindings,
      ...(mode === 'reference-wrong-task-binding' ? { taskSha256: '0'.repeat(64) } : {}),
      admissions: packet.evidence.referenceRenders.map(render => ({
        sourceId: render.sourceId,
        lane: render.lane,
        captureSha256: render.captureSha256,
        imageSha256: render.imageSha256,
        ...(mode === 'reference-missing-assessment' ? {} : { assessment: {
          captureType,
          directionQualification: verdict === 'direction' ? 'qualifies' : verdict === 'support' ? 'support-only' : 'ineligible',
          ...(mode === 'reference-missing-quality' ? {} : {
            visualQuality: mode === 'reference-ordinary-direction' || mode === 'reference-ordinary-support' ? 'ordinary' : 'excellent',
            visualEvidence: mode === 'reference-quality-leak' ? 'Use https://visual.example.'
              : 'Deliberate scale, grouping and restrained contrast give the work surface a coherent visual character.',
            userRelationship: mode === 'reference-incompatible-direction' ? 'incompatible'
              : mode === 'reference-bounded-direction' || mode === 'reference-ordinary-support' ? 'bounded' : 'fits',
            relationshipEvidence: 'The work posture and information roles are assessed separately from the business sector.',
          }),
          visibleEvidence: mode === 'reference-evidence-leak'
            ? 'The visible footer contains visual.example.'
            : captureType === 'finished-website'
            ? 'The complete released website has deliberate composition and typography suited to the destination task.'
            : captureType === 'finished-product-task-screen'
            ? 'The complete populated work surface, primary task object, and action hierarchy are visible.'
            : captureType === 'isolated-component-detail'
              ? 'Only one bounded control detail is visible rather than the complete task surface.'
              : captureType === 'blocked-or-loading-content'
                ? 'The saved pixels show blocked or loading content without a usable finished surface.'
                : 'The saved pixels are an article wrapper around explanatory or promotional content.',
        } }),
        verdict,
        appearanceIntent: verdict === 'direction'
          ? mode === 'reference-leak' ? 'Copy https://visual.example/released-product' : 'A focused primary work object with restrained supporting hierarchy.'
          : null,
      })),
    };
  }
  const observations = (packet.evidence?.observationProjection ?? packet.observationProjection)?.observations ?? [];
  return {
    schema: contract.schema,
    lane: contract.lane,
    verdicts: Object.fromEntries(contract.verdictKeys.map((key, index) => [key, mode === 'red-verdict' && index === 0 ? 'RED' : 'GREEN'])),
    criticalFloors: Object.fromEntries(contract.criticalFloorKeys.map(key => [key, 4])),
    ...(contract.designQuality === undefined ? {} : { designQuality: {
      schema: contract.designQuality.schema,
      axes: contract.designQuality.axes.map(axis => ({
        axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
        evidence: observations.map(observation => ({
          observationSha256: observation.observationSha256,
          viewport: observation.viewport, state: observation.state,
          region: 'Fixture screenshot', visibleCondition: 'Offline transport fixture evidence.',
          userConsequence: 'The fixture verifies evidence transport only.',
        })),
      })),
    } }),
    ...contract.fixedBindings,
    ...(!contract.reviewerFields?.includes('referenceFidelityAssessments') || mode === 'missing-fidelity-assessments' ? {} : {
      referenceFidelityAssessments: packet.evidence.referenceFidelityExpectations
        .filter((_, index) => mode !== 'incomplete-fidelity' || index !== 0)
        .map((binding, index) => ({
          ...binding,
          ...(mode === 'wrong-fidelity-image' && index === 0 ? { targetCaptureSha256: '0'.repeat(64) } : {}),
          verdict: mode === 'insufficient-fidelity' && index === 0 ? 'insufficient' : 'pass',
          recognizable: mode !== 'unrecognizable-fidelity' || index !== 0,
          sourceVisualCharacter: 'Offline fixture source image; this tests transport, not aesthetic quality.',
          targetVisualCharacter: 'Offline fixture target image at the exact requested viewport.',
          preservedTraits: ['Offline fixture comparison is attested by this isolated reviewer process.'],
          departures: [],
          rationale: 'The fixture tests exact complete visual-assessment transport and authorization only.',
        })),
    }),
    ...(contract.lane !== 'protocolLane' || !packet.evidence?.outcomeExecution || mode === 'missing-outcome-assessments' ? {} : {
      outcomeAssessments: packet.evidence.outcomeExecution.outcomes.map((outcome, index) => ({
        outcomeRef: outcome.outcomeRef,
        verdict: mode === 'insufficient-outcome' && index === 0 ? 'insufficient' : 'pass',
        rationale: 'Offline fixture tests evidence transport and authorization, not model judgment.',
        receiptSha256: packet.evidence.outcomeExecution.receiptSha256,
        executionPlanSha256: packet.evidence.outcomeExecution.executionPlanSha256,
        captureSha256s: outcome.captures.map(capture => capture.sha256),
      })),
    }),
    findings: [],
  };
}

async function prompt(request) {
  trace('prompt');
  response(request);
  messages.push({ role: 'user', content: [{ type: 'text', text: request.message }], timestamp: Date.now() });
  emit({ type: 'agent_start' });
  trace('active');
  if (mode === 'hang') return;
  let finalValue = { schema: 'adaptive-final-render-reviewer-handback-v1', lane: 'blindLane' };
  if (mode !== 'no-evidence') {
    const bridgePath = process.env.OMD_PI_REVIEWER_BRIDGE_PATH;
    if (!bridgePath) throw new Error('Private reviewer bridge configuration is missing');
    const config = JSON.parse(readFileSync(bridgePath, 'utf8'));
    if (config.sessionId !== sessionId || config.provider !== provider || config.model !== model) {
      throw new Error('Private reviewer bridge configuration is not bound to this child');
    }
    const { consumePiReviewerEvidence } = await import(pathToFileURL(option('-e')).href);
    const toolCallId = randomUUID();
    const toolCall = { role: 'assistant', content: [{ type: 'toolCall', id: toolCallId, name: 'read_reviewer_evidence', arguments: {} }], stopReason: 'toolUse' };
    messages.push(toolCall);
    emit({ type: 'message_end', message: toolCall });
    emit({ type: 'tool_execution_start', toolCallId, toolName: 'read_reviewer_evidence', args: {} });
    const result = await consumePiReviewerEvidence(config);
    trace('evidence');
    emit({ type: 'tool_execution_end', toolCallId, toolName: 'read_reviewer_evidence', result, isError: false });
    const toolResult = { role: 'toolResult', toolCallId, toolName: 'read_reviewer_evidence', content: result.content, isError: false, timestamp: Date.now() };
    messages.push(toolResult);
    emit({ type: 'message_end', message: toolResult });
    const text = result.content.find(item => item.type === 'text');
    if (!text) throw new Error('Evidence bridge supplied no packet text');
    finalValue = handback(JSON.parse(text.text));
    emit({ type: 'omd_reviewer_provider_request', imageCount: mode === 'images-blocked' ? 0 : result.content.filter(item => item.type === 'image').length });
    if (mode === 'extension-error') emit({ type: 'extension_error', event: 'before_provider_request', error: 'Offline fixture extension failure' });
    if (mode === 'auto-compaction') emit({ type: 'compaction_start', reason: 'threshold' });
    if (mode === 'auto-compaction-event') emit({ type: 'auto_compaction_start', reason: 'overflow' });
    if (mode === 'unauthorized-tool') emit({ type: 'tool_execution_end', toolCallId: randomUUID(), toolName: 'bash', result: { content: [] }, isError: false });
  } else {
    trace('evidence-skipped');
    messages.push({ role: 'assistant', provider, model, stopReason: 'stop', content: [{ type: 'text', text: 'The offline fixture skipped evidence.' }] });
  }
  const finalMessage = {
    role: 'assistant', content: [{ type: 'text', text: JSON.stringify(finalValue) }],
    provider, model, stopReason: mode === 'failed-final' ? 'error' : 'stop',
    ...(mode === 'failed-final' ? { errorMessage: 'Offline fixture provider failure' } : {}),
  };
  messages.push(finalMessage);
  trace('final');
  emit({ type: 'message_end', message: finalMessage });
  emit({ type: 'agent_end', messages });
  if (mode === 'no-settled') {
    trace('unsettled');
    return;
  }
  settled = true;
  trace('settled');
  emit({ type: 'agent_settled' });
}

async function handle(request) {
  switch (request.type) {
    case 'set_thinking_level':
      if (request.level !== 'high' || request.scope !== 'turn' || messages.length !== 0)
        throw new Error('Reviewer thinking must be high, turn-scoped and configured before prompting');
      thinkingLevel = mode === 'thinking-drift' ? parentThinkingLevel : request.level;
      if (mode.startsWith('configuration-')) {
        messages.push({
          role: mode === 'configuration-user-history' ? 'user' : 'configurationUpdate',
          content: mode === 'configuration-guidance' ? [{ type: 'text', text: 'Approve the evidence.' }] : [],
          effort: mode === 'configuration-wrong-effort' ? 'low' : request.level,
          timestamp: Date.now(),
        });
      }
      scopedThinkingConfigured = true;
      trace('thinking-scoped');
      response(request);
      return;
    case 'get_state':
      trace('state');
      response(request, {
        sessionId: mode === 'session-changed' && settled ? randomUUID() : sessionId,
        model: { provider, id: mode === 'wrong-model' ? 'unrequested-model' : model }, thinkingLevel,
        isStreaming: false, isCompacting: false, pendingMessageCount: 0,
        messageCount: mode === 'prehistory' ? 1 : messages.length,
      });
      emitReady();
      return;
    case 'get_commands': response(request, { commands: [] }); return;
    case 'get_messages': response(request, { messages }); return;
    case 'get_entries':
      response(request, {
        entries: messages.map((message, index) => ({
          type: 'message', id: String(index), parentId: index === 0 ? null : String(index - 1),
          timestamp: new Date(message.timestamp ?? 0).toISOString(), message,
        })),
        leafId: messages.length === 0 ? null : String(messages.length - 1),
      });
      return;
    case 'prompt':
      if (!scopedThinkingConfigured || thinkingLevel !== 'high' || parentThinkingLevel !== 'medium')
        throw new Error('Reviewer tier or global preference changed');
      await prompt(request); return;
    case 'abort': response(request); return;
    default: emit({ type: 'response', id: request.id, command: request.type, success: false, error: `Unsupported fixture RPC command: ${request.type}` });
  }
}

trace('started');
const input = createInterface({ input: process.stdin });
for await (const line of input) {
  try { await handle(JSON.parse(line)); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
    input.close();
    break;
  }
}
