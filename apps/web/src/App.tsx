import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDOMInspector,
  type DOMInspectResult,
  type DOMInspector
} from "@hereorcode/dom-inspector";

const emptyResultText =
  "Start the inspector, then click any sample element.";

function App() {
  const inspectorRef = useRef<DOMInspector | null>(null);
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<DOMInspectResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const stopInspector = useCallback(() => {
    inspectorRef.current?.stop();
    setActive(false);
  }, []);

  const startInspector = useCallback(() => {
    inspectorRef.current?.destroy();

    const inspector = createDOMInspector({
      highlight: {
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124, 58, 237, 0.14)"
      },
      selectionScope: { modifierKey: "Alt" },
      exclude: (element) => element.closest("[data-inspector-ignore]") !== null,
      onCancel: () => setActive(false),
      onSelect: (nextResult) => {
        setResult(nextResult);
        setActive(false);
      }
    });

    inspectorRef.current = inspector;
    inspector.start();
    setActive(true);
  }, []);

  useEffect(() => {
    return () => inspectorRef.current?.destroy();
  }, []);

  const copyValue = useCallback(async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setCopiedKey(null);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar" data-inspector-ignore>
        <div>
          <p className="eyebrow">DOM Inspector</p>
          <h1>Click-to-select DOM paths</h1>
        </div>
      </header>

      <main className="workspace">
        <section className="sample-area" aria-label="Sample DOM">
          <div className="sample-header">
            <p>Sample Surface</p>
            <span>Click any element after starting inspector</span>
          </div>

          <div className="sample-grid">
            <article className="profile-panel">
              <div className="avatar" aria-hidden="true">
                DI
              </div>
              <div>
                <h2>Inspector target group</h2>
                <p>
                  This area contains nested elements with repeated sibling tags so
                  selectors and XPath indexes are easy to verify.
                </p>
              </div>
            </article>

            <div className="nested-demo">
              <div className="nested-column">
                <div className="sample-block">First nested div</div>
                <div className="sample-block highlighted-sample">
                  Second nested div
                </div>
              </div>
            </div>

            <form className="settings-panel" onSubmit={(event) => event.preventDefault()}>
              <label>
                Project name
                <input defaultValue="DOM Inspector" />
              </label>
              <label>
                Mode
                <select defaultValue="selector">
                  <option value="selector">Selector</option>
                  <option value="xpath">XPath</option>
                </select>
              </label>
              <button type="submit">Save Sample</button>
            </form>

            <div className="edge-case-grid">
              <div className="edge-case-panel">
                <h3>Same-origin iframe</h3>
                <iframe
                  title="Same-origin inspector sample"
                  src="iframe-sample.html"
                />
              </div>

              <div className="edge-case-panel">
                <h3>Open shadow DOM</h3>
                <ShadowSample />
              </div>

              <div className="edge-case-panel">
                <h3>Iframe shadow DOM</h3>
                <iframe
                  title="Iframe shadow DOM inspector sample"
                  src="iframe-shadow-sample.html"
                />
              </div>

              <div className="edge-case-panel pseudo-panel">
                <h3>Pseudo element</h3>
                <button className="pseudo-target" type="button">
                  Badge is ::before
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="result-panel" data-inspector-ignore>
          <div>
            <p className="panel-label">Selected Result</p>
            <h2>{result ? getResultTitle(result) : "No element selected"}</h2>
          </div>

          {result ? (
            <div className="path-list">
              <PathRow
                copied={copiedKey === "rootKind"}
                label="rootKind"
                value={result.rootKind}
                onCopy={() => copyValue("rootKind", result.rootKind)}
              />
              <PathRow
                copied={copiedKey === "selector"}
                label="selector"
                value={result.selector}
                onCopy={() => copyValue("selector", result.selector)}
              />
              <PathRow
                copied={copiedKey === "xpath"}
                label="xpath"
                value={result.xpath}
                onCopy={() => copyValue("xpath", result.xpath)}
              />
              <PathRow
                copied={copiedKey === "fullXPath"}
                label="fullXPath"
                value={result.fullXPath}
                onCopy={() => copyValue("fullXPath", result.fullXPath)}
              />
              <PathRow
                copied={copiedKey === "jsPath"}
                label="jsPath"
                value={result.jsPath}
                onCopy={() => copyValue("jsPath", result.jsPath)}
              />
              {result.pseudoElement ? (
                <PathRow
                  copied={copiedKey === "selectorWithPseudo"}
                  label="selectorWithPseudo"
                  value={result.selectorWithPseudo}
                  onCopy={() =>
                    copyValue("selectorWithPseudo", result.selectorWithPseudo)
                  }
                />
              ) : null}
              {result.pseudoElements.length > 0 ? (
                <PathRow
                  copied={copiedKey === "pseudoElements"}
                  label="pseudoElements"
                  value={result.pseudoElements
                    .map((pseudo) => pseudo.pseudoElement)
                    .join(", ")}
                  onCopy={() =>
                    copyValue(
                      "pseudoElements",
                      result.pseudoElements
                        .map((pseudo) => pseudo.pseudoElement)
                        .join(", ")
                    )
                  }
                />
              ) : null}
              {result.framePath.length > 0 ? (
                <PathRow
                  copied={copiedKey === "framePath"}
                  label="framePath"
                  value={result.framePath
                    .map((frame) => frame.selector)
                    .join(" -> ")}
                  onCopy={() =>
                    copyValue(
                      "framePath",
                      result.framePath.map((frame) => frame.selector).join(" -> ")
                    )
                  }
                />
              ) : null}
              {result.shadowPath.length > 0 ? (
                <PathRow
                  copied={copiedKey === "shadowPath"}
                  label="shadowPath"
                  value={result.shadowPath
                    .map((shadow) => shadow.hostSelector)
                    .join(" -> ")}
                  onCopy={() =>
                    copyValue(
                      "shadowPath",
                      result.shadowPath
                        .map((shadow) => shadow.hostSelector)
                        .join(" -> ")
                    )
                  }
                />
              ) : null}
            </div>
          ) : (
            <p className="empty-state">{emptyResultText}</p>
          )}
        </aside>
      </main>

      <div className="floating-toolbar" data-inspector-ignore>
        <span className={active ? "status active" : "status"}>
          {active ? "Inspecting" : "Idle"}
        </span>
        <button
          className="secondary-button"
          disabled={!active}
          type="button"
          onClick={stopInspector}
        >
          Stop
        </button>
        <button
          className="secondary-button"
          disabled={!result}
          type="button"
          onClick={clearResult}
        >
          Clear
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={startInspector}
        >
          {active ? "Restart" : "Start"}
        </button>
      </div>
    </div>
  );
}

function ShadowSample() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>
        :host {
          display: block;
        }

        button {
          width: 100%;
          min-height: 56px;
          border: 1px solid #a78bfa;
          border-radius: 8px;
          background: #faf5ff;
          color: #5b21b6;
          font: inherit;
          font-weight: 800;
        }
      </style>
      <button type="button">Shadow button</button>
    `;
  }, []);

  return <div className="shadow-host" ref={hostRef} />;
}

function getResultTitle(result: DOMInspectResult): string {
  const tagName = result.element.tagName.toLowerCase();

  return result.pseudoElement ? `${tagName}${result.pseudoElement}` : tagName;
}

type PathRowProps = {
  copied: boolean;
  label: string;
  value: string;
  onCopy: () => void;
};

function PathRow({ copied, label, value, onCopy }: PathRowProps) {
  return (
    <div className="path-row">
      <div className="path-row-header">
        <span>{label}</span>
        <button type="button" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code>{value}</code>
    </div>
  );
}

export default App;
