export default function Install() {
  return (
    <div className="grid install" id="install">
      <div className="prose">
        <h2>Install: the two supported paths</h2>
        <p className="body-copy">
          Two install paths, same tool underneath. <code>omd check</code> and{' '}
          <code>omd doctor</code>, above, are this package's project-level CLI, run inside a
          project once it is installed; <code>oh-my-design install</code> and{' '}
          <code>oh-my-design doctor</code>, below, are the same package's host-install CLI, run
          once to set the tool up in the first place.
        </p>
        <p className="req">Needs Node.js 22.18 or newer, and Claude Code or Codex already configured.</p>
      </div>
      <div className="full">
        <div className="install-blocks">
          <div className="install-block">
            <h3>npm — global CLI</h3>
            <pre className="terminal">{`npm install -g @3xhaust/oh-my-design
oh-my-design install
oh-my-design doctor`}</pre>
            <a
              className="cta-label"
              href="https://www.npmjs.com/package/@3xhaust/oh-my-design"
              target="_blank"
              rel="noreferrer"
            >
              Install via npm — installs the CLI, runs the host install, then verifies with doctor
            </a>
          </div>
          <div className="install-block">
            <h3>Claude Code — plugin marketplace</h3>
            <pre className="terminal">{`/plugin marketplace add 3x-haust/oh-my-design
/plugin install oh-my-design@omd`}</pre>
            <p className="then-run">
              Then run <code>/ultradesign</code> in a session.
            </p>
            <a className="cta-label" href="#install">
              Add the plugin marketplace — then run /ultradesign
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
