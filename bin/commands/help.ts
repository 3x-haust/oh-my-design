export function printLifecycleHelp(): never {
  console.log([
    'Usage:',
    '  omd lifecycle help',
    '  omd lifecycle verify install|ci|build|typecheck|test|lint [--project <dir>] [--json]',
    '  omd lifecycle finish [--project <dir>] [--manifest <json>] [--json]',
  ].join('\n'));
  process.exit(0);
}

export function printUsage(exitCode = 1): never {
  const message = [
    'usage: omd <command>',
    '',
    '  --version',
    '  help | --help | -h',
    '  lifecycle help|verify|finish',
    '  route starter|validate|classify|show|check',
    '  schema list | schema <allowlisted-name> | schema ai-judgment --purpose <purpose>',
    '  stage next [--json]',
    '  guard production|completion [--json]',
    '  ref browse|tidy|context|navigate|control-observe|cookie-control',
    '  ref discover-plan|discover-batch|work-next|advance|exclude',
    '  ref research-set|research-check|search|leads',
    '  ref add|add-batch|list|show|principles|audit|import-image',
    '  feedback report|translate|check',
    '  language translate|check',
    '  ai-judgment publish|check',
    '  locale plan|profile|profile-check|source-capture|source-stability|check',
    '  first-render check|review',
    '  render <page> [options]',
    '  check [<page>|--ir <file>] [options]',
    '  probe <page> [options]',
    '  slop scan|score',
    '  lighthouse <report.json> [options]',
    '  measure --entry <local.html|URL> [--scope <scope.json>] [--json]',
    '  figma pull|system|diff',
    '  target set|list|diff',
    '  pack dir|list|<relpath> [--section <heading>]',
    '  doctor',
    '  browser setup|login|skip|status|forget',
    '  coach',
    '  learn predict|judge|observe|promote|rules',
    '  usage [--json]',
    '  hash <.omd/artifact-path> [--json]',
  ].join('\n');
  if (exitCode === 0) console.log(message);
  else console.error(message);
  process.exit(exitCode);
}
