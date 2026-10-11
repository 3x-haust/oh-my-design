/** Model the observed host projection between tool execution and the provider hook. */
export async function projectedReviewerEvidence(bridge, config, sessionId, systemPrompt) {
  const handlers = new Map();
  let tool;
  bridge.default({
    getActiveTools: () => ['read_reviewer_evidence'],
    on: (event, handler) => handlers.set(event, handler),
    registerTool: value => { tool = value; },
  });
  const context = {
    cwd: process.cwd(),
    model: { provider: config.provider, id: config.model },
    thinkingLevel: config.thinkingLevel,
    sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
    getSystemPrompt: () => systemPrompt,
  };
  const result = await tool.execute('evidence', {}, undefined, undefined, context);
  const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  const projected = text.length > 64_000
    ? `${text.slice(0, 48_000)}\n[tool result projected]\n${text.slice(-16_000)}` : text;
  const images = result.content.filter(part => part.type === 'image').map(part => ({
    type: 'input_image', image_url: `data:${part.mimeType};base64,${part.data}`,
  }));
  const payload = { input: [
    { type: 'function_call', call_id: 'evidence', name: 'read_reviewer_evidence', arguments: '{}' },
    { type: 'function_call_output', call_id: 'evidence', output: [
      { type: 'input_text', text: projected }, ...images,
    ] },
  ] };
  const delivered = await handlers.get('before_provider_request')({ payload }, context);
  const message = delivered.input.find(part => part.role === 'user');
  if (!message) throw new Error('Full evidence was not delivered');
  return { result, packetText: message.content[0].text };
}
