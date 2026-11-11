export function printLifecycleHelp(): never {
  console.log([
    'Usage:',
    '  omd lifecycle help',
    '  omd lifecycle verify install|ci|build|typecheck|test|lint [--project <dir>] [--json]',
    '  omd lifecycle finish [--project <dir>] [--manifest <json>] [--json]',
  ].join('\n'));
  process.exit(0);
}

/**
 * Inside a design loop (a project with .omd/thin/state.json) help names only the loop's own commands, so the maker is
 * not invited into the retired staged workflow; `omd help --all` still lists everything.
 */
export function printThinUsage(): never {
  console.log([
    'usage: omd <command>   (this project is in an omd-ultradesign loop; only these commands belong to it)',
    '',
    '  thin start|status|shoot|refs|check|packet|eye|close|go|begin   (omd thin help for the forms)',
    '  imagegen --kind asset --name <name> --prompt <idea> [--reference <image>]... [--json]',
    '  studio asset <candidate> --out <path> [--cut] [--json]',
    '  studio sheet --name <sheet> <image>... [--json]',
    '  measure --entry <local.html|URL> [--scope <scope.json>] [--json]',
    '',
    '  omd help --all lists every other command; none of them is part of this loop.',
  ].join('\n'));
  process.exit(0);
}

export function printUsage(exitCode = 1): never {
  const message = [
    'usage: omd <command>',
    '',
    '  Design work starts from the omd-ultradesign skill in your agent; it runs these commands itself.',
    '',
    '  --version',
    '  help | --help | -h',
    '  lifecycle help|verify|finish',
    '  route starter|validate|classify|show|check',
    '  schema list | schema <allowlisted-name> | schema ai-judgment --purpose <purpose>',
    '  stage next [--json]',
    '  guard production|completion [--json]',
    '  ref browse|tidy|context|navigate|control-observe|cookie-control',
    '  ref discover-plan|discover-batch|work-next|advance|exclude|direction-review',
    '  ref research-set|research-check|search|leads',
    '  ref add|add-batch|list|show|principles|audit|import-image',
    '  feedback report|translate|check',
    '  language translate|check',
    '  ai-judgment publish|check',
    '  locale plan|profile|profile-check|source-capture|source-stability|check',
    '  first-render check|review|restore',
    '  render <page> [options]',
    '  record <page> --steps <steps.json> [--viewport WxH] [--out dir]',
    '  check [<page>|--ir <file>] [options]',
    '  probe <page> [options]',
    '  slop scan|score',
    '  lighthouse <report.json> [options]',
    '  measure --entry <local.html|URL> [--scope <scope.json>] [--json]',
    '  figma pull|system|diff|review',
    '  target set|list|diff',
    '  brief --input <design-brief.json> [--json]',
    '  imagegen --name <section> --prompt <idea> [--reference <image>]... [--json]',
    '  imagegen --kind page --name <section> --prompt <exact copy, layout, type, proof> [--json]',
    '  imagegen --kind board|asset --name <name> --prompt <product or set> [--reference <board>] [--viewport mobile] [--json]',
    '  taste compare|graphic [--anchor <url>] [<rendered.png> --against <image.path>] [--skip <reason>] [--json]',
    '  studio refs|blueprint|rig|look|baseline|check [<url>...] [--page <file>] [--mode marketing|product|redesign] [--json]',
    '  studio board|sheet|asset|image [<image|page|candidate>...] [--name <sheet>] [--out <path>] [--cut] [--split auto] [--source <url> --licence <id>] [--json]',
    '  thin start|status|shoot|refs|check|packet|eye|close|go|begin [--kind marketing|product|redesign] [--request <text>] [--continue] [--keep <path>]... [--json]   (internal: called by omd-ultradesign)',
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
