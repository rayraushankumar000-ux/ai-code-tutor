import { useEffect, useRef, useState } from "react";

import LiveCodeEditor from "./LiveCodeEditor.jsx";
import VerificationPanel from "./VerificationPanel.jsx";
import ReviewHistory from "./ReviewHistory.jsx";
import RunPanel from "./RunPanel.jsx";
import TestPanel from "./TestPanel.jsx";
import PracticeProgress from "./PracticeProgress.jsx";
import { problems } from "./problems.js";

import "./App.css";

const languages = {
  python: "Python",
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  c: "C",
  cpp: "C++",
};

const navigation = [
  ["workspace", "01", "Code & practise"],
  ["progress", "02", "My progress"],
  ["history", "03", "Review history"],
  ["evidence", "04", "Saved experiments"],
];

const pageContent = {
  workspace: {
    title: "Your space to build and learn.",
    description:
      "A focused space to write, understand and improve your code.",
  },
  progress: {
    title: "See how far you’ve come.",
    description:
      "Your latest sample-test results, saved in this browser.",
  },
  history: {
    title: "Pick up where you left off.",
    description:
      "Revisit previous feedback and import your saved reviews.",
  },
  evidence: {
    title: "Explore the evidence.",
    description:
      "Historical Java experiments, separate from your current code.",
  },
};

const editorToolbarStyle = {
  boxSizing: "border-box",
  height: 60,
  padding: "0 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  background: "#172033",
  color: "#e2e8f0",
  borderBottom: "1px solid #334155",
};

const fullscreenButtonStyle = {
  padding: "8px 12px",
  border: "1px solid #52617a",
  borderRadius: 8,
  background: "#26344c",
  color: "#ffffff",
  font: "inherit",
  cursor: "pointer",
};

export default function App() {
  const [view, setView] = useState("workspace");
  const [tool, setTool] = useState("tests");

  const [problemId, setProblemId] = useState("");
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("print(user_name)");
  const [goal, setGoal] = useState("");

  const [result, setResult] = useState(null);
  const [latestTestReport, setLatestTestReport] = useState(null);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  const [editorFullScreen, setEditorFullScreen] = useState(false);
  const fullscreenButton = useRef(null);

  const problem =
    problems.find((item) => item.id === problemId) ?? null;

  const busy = loading || testing;

  const disabled =
    busy || !code.trim() || code.length > 4000;

  const isFallback = result?.feedback_source === "fallback";

  const currentPage = pageContent[view];

  const currentNavigation = navigation.find(
    ([id]) => id === view
  );

  useEffect(() => {
    if (!editorFullScreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditorFullScreen(false);
        fullscreenButton.current?.focus();
      }
    }

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [editorFullScreen]);

  function clearResult() {
    setResult(null);
    setError("");
  }

  function changeProblem(event) {
    const nextId = event.target.value;
    const selectedProblem = problems.find(
      (item) => item.id === nextId
    );

    setProblemId(nextId);
    setGoal(selectedProblem?.goal ?? "");
    setTool("tests");
    clearResult();
  }

  function changeView(nextView) {
    setEditorFullScreen(false);
    setView(nextView);
  }

  async function askTutor(mode) {
    if (disabled) return;

    clearResult();
    setLoading(true);

    const submission = {
      language,
      code,
      goal,
      mode,
    };

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      200000
    );

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Request failed. Check the backend terminal."
        );
      }

      if (
        typeof data?.feedback !== "string" ||
        (
          data.checks != null &&
          !Array.isArray(data.checks.issues)
        )
      ) {
        throw new Error(
          "Unexpected response from the backend."
        );
      }

      const model =
        typeof data.model === "string" && data.model.trim()
          ? data.model
          : null;

      const responseTime =
        typeof data.response_time_seconds === "number" &&
        Number.isFinite(data.response_time_seconds) &&
        data.response_time_seconds >= 0
          ? data.response_time_seconds
          : null;

      setResult({
        ...data,
        model,
        response_time_seconds: responseTime,
        submission,
        received_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "AI timed out. Try a shorter code example."
          : err.message || "Could not complete the request."
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function downloadReview() {
    if (!result || loading) return;

    const report = {
      report_version: 1,
      project: "AI Code Review and Programming Tutor",
      received_at: result.received_at,
      submission: result.submission,
      response: {
        model: result.model ?? null,
        response_time_seconds:
          result.response_time_seconds ?? null,
        feedback_source:
          result.feedback_source ?? "unknown",
        feedback: result.feedback,
        checks: result.checks ?? null,
        truncated: Boolean(result.truncated),
        verification: result.verification,
      },
      notice:
        result.feedback_source === "fallback"
          ? "Feedback is a general debugging template, not an AI-generated diagnosis."
          : "AI suggestions can be incorrect. Suggested code has not been executed or verified.",
    };

    let url;
    let link;

    try {
      const blob = new Blob(
        [JSON.stringify(report, null, 2)],
        { type: "application/json;charset=utf-8" }
      );

      url = URL.createObjectURL(blob);
      link = document.createElement("a");

      const timestamp = result.received_at.replace(
        /[:.]/g,
        "-"
      );

      link.href = url;
      link.download =
        `code-tutor-${result.submission.language}-` +
        `${result.submission.mode}-${timestamp}.json`;

      document.body.appendChild(link);
      link.click();
    } catch {
      setError("Could not download the review.");
    } finally {
      link?.remove();

      if (url) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>

      <aside className="sidebar">
        <a
          className="brand"
          href="#main-content"
          onClick={() => changeView("workspace")}
        >
          <span className="brand-mark" aria-hidden="true">
            &lt;/&gt;
          </span>

          <span>
            Code Tutor
            <small>YOUR PROGRAMMING WORKSPACE</small>
          </span>
        </a>

        <div className="nav-caption">WORKSPACE</div>

        <nav aria-label="Main navigation">
          {navigation.map(([id, number, label]) => (
            <button
              key={id}
              type="button"
              className={
                view === id ? "nav-item active" : "nav-item"
              }
              aria-current={view === id ? "page" : undefined}
              onClick={() => changeView(id)}
            >
              <span className="nav-number">{number}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="small-label">LEARN BY DOING</span>

          <h3>
            A little practice.
            <br />
            A clearer understanding.
          </h3>

          <p>
            Write a solution, ask for a hint, then check your
            output.
          </p>
        </div>

        <div className="sidebar-bottom">
          <span className="brand-dot" />
          Local learning workspace
          <small>AI assistance · 6 languages</small>
        </div>
      </aside>

      <main id="main-content" className="main-content">
        <div className="topbar">
          <span>
            Workspace
            <span className="breadcrumb">
              {" / "}
              {currentNavigation?.[2]}
            </span>
          </span>

          <span className="topbar-tag">
            AI Code Review & Programming Tutor
          </span>
        </div>

        <header className="page-heading">
          <div>
            <span className="eyebrow">
              YOUR LEARNING SPACE
            </span>

            <h1>{currentPage.title}</h1>
            <p>{currentPage.description}</p>
          </div>

          <span className="page-chip">
            {view === "workspace"
              ? "PRACTICE • REVIEW • IMPROVE"
              : "CODE TUTOR"}
          </span>
        </header>

        <div hidden={view !== "workspace"}>
          <section className="panel problem-panel">
            <div className="problem-top">
              <div>
                <span className="eyebrow">START HERE</span>
                <h2>Choose your challenge</h2>
              </div>

              <div className="problem-picker">
                <label htmlFor="practice-problem">
                  Practice problem
                </label>

                <select
                  id="practice-problem"
                  value={problemId}
                  disabled={busy}
                  onChange={changeProblem}
                >
                  <option value="">
                    Custom code / custom tests
                  </option>

                  {problems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.difficulty}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {problem ? (
              <>
                <div className="problem-title">
                  <h3>{problem.title}</h3>

                  <span className="difficulty">
                    {problem.difficulty}
                  </span>

                  <span className="sample-count">
                    {problem.cases.length} sample cases
                  </span>
                </div>

                <p className="problem-description">
                  {problem.goal}
                </p>

                {problem.cases.length > 0 && (
                  <div className="example-grid">
                    <div>
                      <span className="small-label">
                        EXAMPLE INPUT
                      </span>

                      <pre>{problem.cases[0].stdin}</pre>
                    </div>

                    <div>
                      <span className="small-label">
                        EXPECTED OUTPUT
                      </span>

                      <pre>
                        {problem.cases[0].expected_output}
                      </pre>
                    </div>
                  </div>
                )}

                <details className="problem-details">
                  <summary>
                    Input format & instructions
                  </summary>

                  <p>
                    <strong>Input:</strong> {problem.input}
                  </p>

                  <p>
                    <strong>Output:</strong> {problem.output}
                  </p>

                  <p>
                    Print only the answer. The editor keeps your
                    existing code when you change problems.
                    These are visible sample cases, not hidden
                    judging tests.
                  </p>
                </details>
              </>
            ) : (
              <p className="muted custom-description">
                Bring your own code, or select a practice
                problem to load its description and tests.
                Your editor code stays in place.
              </p>
            )}
          </section>

          <div className="workspace">
            <section className="panel editor-panel">
              <div className="panel-heading">
                <h2>
                  <span
                    className="heading-icon"
                    aria-hidden="true"
                  >
                    &lt;/&gt;
                  </span>
                  {" "}Code editor
                </h2>

                <select
                  aria-label="Programming language"
                  value={language}
                  disabled={busy}
                  onChange={(event) => {
                    setLanguage(event.target.value);
                    clearResult();
                  }}
                >
                  {Object.entries(languages).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="goal-field">
                <label htmlFor="goal">
                  What should this code do?
                </label>

                <input
                  id="goal"
                  type="text"
                  value={goal}
                  maxLength={500}
                  readOnly={Boolean(problem)}
                  disabled={busy}
                  placeholder="Example: Return the sum of two numbers"
                  onChange={(event) => {
                    setGoal(event.target.value);
                    clearResult();
                  }}
                />
              </div>

              <div
                style={
                  editorFullScreen
                    ? {
                        position: "fixed",
                        inset: 0,
                        zIndex: 10000,
                        width: "100%",
                        height: "100dvh",
                        background: "#1e1e1e",
                        overflow: "hidden",
                      }
                    : {
                        minWidth: 0,
                        background: "#1e1e1e",
                      }
                }
              >
                <div style={editorToolbarStyle}>
                  <span>{languages[language]} editor</span>

                  <button
                    ref={fullscreenButton}
                    type="button"
                    aria-pressed={editorFullScreen}
                    onClick={() =>
                      setEditorFullScreen((current) => !current)
                    }
                    style={fullscreenButtonStyle}
                  >
                    {editorFullScreen
                      ? "Exit full screen (Esc)"
                      : "Full screen"}
                  </button>
                </div>

                <LiveCodeEditor
                  height={
                    editorFullScreen
                      ? "calc(100dvh - 60px)"
                      : "400px"
                  }
                  language={language}
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => {
                    setCode(value ?? "");
                    clearResult();
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 15,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    readOnly: busy,
                    ariaLabel: "Code editor",
                  }}
                />
              </div>

              <div className="actions">
                <button
                  type="button"
                  onClick={() => askTutor("review")}
                  disabled={disabled}
                >
                  Review with AI
                </button>

                <button
                  type="button"
                  onClick={() => askTutor("hint")}
                  disabled={disabled}
                >
                  Give me a hint
                </button>

                <span>
                  {code.length.toLocaleString()} / 4,000
                  characters
                </span>
              </div>

              {code.length > 4000 && (
                <p className="error">
                  Please shorten your code to 4,000 characters
                  or fewer.
                </p>
              )}
            </section>

            <section
              className="panel results tutor-panel"
              aria-live="polite"
              aria-busy={loading}
            >
              <div className="panel-heading">
                <h2>
                  <span
                    className="heading-icon"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  {" "}AI tutor
                </h2>

                <button
                  type="button"
                  onClick={downloadReview}
                  disabled={!result || loading}
                >
                  Download Review
                </button>
              </div>

              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}

              {loading && (
                <div className="loading-state">
                  <span
                    className="loading-dot"
                    aria-hidden="true"
                  />

                  <p className="muted">
                    AI is analyzing your code. Local processing
                    may take a few minutes.
                  </p>
                </div>
              )}

              {!result && !error && !loading && (
                <div className="empty-state">
                  <div
                    className="empty-state-icon"
                    aria-hidden="true"
                  >
                    ✦
                  </div>

                  <h3>Your next insight starts here.</h3>

                  <p className="muted">
                    Write some code, then choose Review with AI
                    for feedback or Give me a hint to keep
                    solving it yourself.
                  </p>
                </div>
              )}

              {result && (
                <>
                  <p className="muted">
                    {result.verification}
                  </p>

                  <div className="review-meta">
                    <span>
                      Model: {result.model ?? "Not recorded"}
                    </span>

                    <span>
                      {" · "}AI request time:{" "}
                      {result.response_time_seconds != null
                        ? `${result.response_time_seconds.toFixed(2)} seconds`
                        : "Not recorded"}
                    </span>
                  </div>

                  <p className="muted">
                    AI request time includes the hosted AI request and response parsing; Python static-check
                    time is excluded.
                  </p>

                  {result.checks && (
                    <>
                      <div className="summary">
                        <span>
                          Syntax:{" "}
                          {result.checks.syntax_valid
                            ? "Valid"
                            : "Invalid"}
                        </span>

                        <strong>
                          {result.checks.issue_count} static{" "}
                          {result.checks.issue_count === 1
                            ? "issue"
                            : "issues"}
                        </strong>
                      </div>

                      {result.checks.issues.map(
                        (issue, index) => (
                          <article
                            className="issue"
                            key={index}
                          >
                            <div className="issue-heading">
                              <strong>{issue.rule}</strong>

                              <span>
                                Line {issue.line ?? "?"}, column{" "}
                                {issue.column ?? "?"}
                              </span>
                            </div>

                            <p>{issue.message}</p>
                          </article>
                        )
                      )}
                    </>
                  )}

                  <h3>
                    {isFallback
                      ? "General debugging hint (template)"
                      : "AI response"}
                  </h3>

                  <pre className="ai-feedback">
                    {result.feedback}
                  </pre>

                  {result.truncated && (
                    <p className="error">
                      The AI response reached its length limit
                      and may be incomplete.
                    </p>
                  )}

                  <p className="muted">
                    {isFallback
                      ? "This is a general debugging template, not an AI-generated diagnosis."
                      : "AI suggestions can be incorrect. Suggested code has not been executed or verified."}
                  </p>
                </>
              )}
            </section>
          </div>

          <section className="toolbox">
            <div className="toolbox-heading">
              <div>
                <span className="eyebrow">
                  CHECK YOUR WORK
                </span>

                <h2>Execution & testing</h2>
              </div>

              <div
                className="tool-switch"
                role="group"
                aria-label="Execution view"
              >
                <button
                  type="button"
                  aria-pressed={tool === "tests"}
                  className={
                    tool === "tests" ? "selected" : ""
                  }
                  onClick={() => setTool("tests")}
                >
                  Test cases
                </button>

                <button
                  type="button"
                  aria-pressed={tool === "run"}
                  className={tool === "run" ? "selected" : ""}
                  onClick={() => setTool("run")}
                >
                  Run console
                </button>
              </div>
            </div>

            <div hidden={tool !== "run"}>
              <RunPanel language={language} code={code} />
            </div>

            <div hidden={tool !== "tests"}>
              <TestPanel
                key={problemId || "custom"}
                language={language}
                code={code}
                problem={problem}
                onRunningChange={setTesting}
                onReport={setLatestTestReport}
                disabled={loading}
              />
            </div>
          </section>
        </div>

        <div hidden={view !== "progress"}>
          <PracticeProgress latestReport={latestTestReport} />
        </div>

        <div hidden={view !== "history"}>
          <ReviewHistory result={result} />
        </div>

        <div hidden={view !== "evidence"}>
          <VerificationPanel />
        </div>

        <footer className="app-footer">
          <span>
            Code Tutor
            <span className="footer-dot"> · </span>
            Learn through practice.
          </span>

          <span>
            AI suggestions can be incorrect. Run tests to check
            your work.
          </span>
        </footer>
      </main>
    </div>
  );
}