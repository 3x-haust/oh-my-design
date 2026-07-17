import { useRef, useState } from "react";
import { useReveal } from "../hooks/useReveal";
import type { Locale } from "../data/content";
import { getCopy } from "../data/i18n";

const INSTALL_COMMANDS = `npm install -g oh-my-design
oh-my-design install
oh-my-design doctor
omd doctor`;

type CopyState = "idle" | "success" | "error";

// The one interactive surface on an otherwise static page. Implements the two
// interaction states that actually apply here: success (Doherty threshold —
// acknowledgment inside 400ms, here effectively instant) and error (clipboard
// permission can be denied by the browser). Loading/empty/disabled/offline are
// recorded as not-applicable via `omd decision` — see .omd/decisions.md.
export function Install({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  const ref = useReveal<HTMLElement>();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timeoutRef = useRef<number | undefined>(undefined);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMANDS);
      setCopyState("success");
    } catch {
      setCopyState("error");
    } finally {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopyState("idle"), 3000);
    }
  }

  return (
    <section className="install" id="install" ref={ref}>
      <h2>{t.install.heading}</h2>
      <p>{t.install.requires}</p>

      <div className="code-block-wrap">
        <pre className="code-block">
          <code>{INSTALL_COMMANDS}</code>
        </pre>
        <button type="button" className="code-copy" onClick={handleCopy} aria-label={t.install.copyAriaLabel}>
          <span className="copy-label-swap" key={copyState}>
            {copyState === "success" ? t.install.copiedLabel : copyState === "error" ? t.install.copyErrorLabel : t.install.copyLabel}
          </span>
        </button>
      </div>

      <p role="status" aria-live="polite" className="copy-status">
        {copyState === "success" && t.install.copySuccessStatus}
      </p>
      {copyState === "error" && (
        <p role="alert" className="copy-error">
          {t.install.copyErrorStatus}
        </p>
      )}

      <p className="fine">
        <code>oh-my-design doctor</code> {t.install.fineHostDoctor} <code>omd doctor</code> {t.install.fineRuntimeDoctor}
      </p>
    </section>
  );
}
