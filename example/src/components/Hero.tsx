export default function Hero() {
  return (
    <div className="grid hero">
      <div className="prose">
        <h1>Confident output is not the same as accountable output.</h1>
        <p className="subhead">
          A coding agent can generate a UI that looks finished in one prompt. It cannot tell you
          why it chose that layout, that copy, or that color, because nothing recorded the
          choice. Oh My Design (OMD) makes the agent write down every decision — before, during,
          and after the build — so the reasoning survives the run.
        </p>
        <a className="cta" href="#ledger">
          Read the stage record below
        </a>
        <nav className="gate-links" data-region="gate-links" aria-label="Fast credibility checks">
          <a href="#cli-proof">See the actual commands that enforce this gate</a>
          <a href="#footer">View the source on GitHub</a>
        </nav>
      </div>
    </div>
  )
}
