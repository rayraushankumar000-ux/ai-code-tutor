import { useRef, useState } from "react";

const languages = [
  "python",
  "java",
  "javascript",
  "typescript",
  "c",
  "cpp",
];

const labels = {
  passed: "PASS",
  wrong_answer: "FAIL — output mismatch",
  compile_error: "Compilation / syntax-check error",
  execution_error: "Execution error",
  time_limit: "Time limit exceeded",
  output_limit: "Output limit exceeded",
  runner_error: "Runner unavailable",
  not_run: "Not run",
};

export default function TestPanel({
  language,
  code,
  problem = null,
  onRunningChange,
  onReport,
  disabled = false,
}) {
  const [cases, setCases] = useState(() =>
    problem
      ? problem.cases.map((item) => ({ ...item }))
      : [{ stdin: "", expected_output: "" }]
  );

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const inFlight = useRef(false);

  const blocked =
    disabled ||
    running ||
    !languages.includes(language) ||
    !code.trim() ||
    code.length > 4000;

  function updateCase(index, field, value) {
    setCases((previous) =>
      previous.map((item, position) =>
        position === index
          ? { ...item, [field]: value }
          : item
      )
    );
  }

  async function runTests() {
    if (blocked || inFlight.current) return;

    inFlight.current = true;
    setRunning(true);
    onRunningChange?.(true);
    setReport(null);
    setError("");

    const submission = {
      language,
      code,
      cases: cases.map((item) => ({ ...item })),
    };

    const selectedProblem = problem
      ? { id: problem.id, title: problem.title }
      : null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch("/api/run-tests", {
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
            : "Test request failed. Check the backend terminal."
        );
      }

      if (
        !Array.isArray(data?.results) ||
        data.results.length !== submission.cases.length ||
        data.total !== submission.cases.length ||
        !Number.isInteger(data.passed) ||
        data.passed < 0 ||
        data.passed > data.total ||
        typeof data.total_seconds !== "number" ||
        !Number.isFinite(data.total_seconds) ||
        data.total_seconds < 0 ||
        !data.results.every(
          (item) =>
            item &&
            Object.hasOwn(labels, item.status) &&
            typeof item.actual_output === "string" &&
            typeof item.expected_output === "string" &&
            typeof item.stdin === "string"
        ) ||
        data.passed !==
          data.results.filter((item) => item.status === "passed").length
      ) {
        throw new Error("Unexpected test response.");
      }

      const completedReport = {
        ...data,
        submission,
        problem: selectedProblem,
        received_at: new Date().toISOString(),
      };

      setReport(completedReport);
      onReport?.(completedReport);
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Request timed out. The backend may still be finishing tests. Check its terminal before retrying."
          : err.message || "Could not run tests."
      );
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setRunning(false);
      onRunningChange?.(false);
    }
  }

  const stale = Boolean(
    report &&
      (language !== report.submission.language ||
        code !== report.submission.code ||
        JSON.stringify(cases) !==
          JSON.stringify(report.submission.cases))
  );

  return (
    <section className="panel execution-panel">
      <h2>
        {problem
          ? `Practice tests: ${problem.title}`
          : "Automatic test cases — custom"}
      </h2>

      <p className="muted">
        Selected language: {language}. Write a complete console
        program that reads standard input and prints the requested
        output.
      </p>

      <p className="muted">
        {problem
          ? "Three predefined sample cases are loaded. Their values are read-only to avoid accidental changes. Select Custom code / custom tests above to enter your own cases."
          : "Enter up to three inputs and their expected outputs. Empty fields mean empty input or empty output."}
      </p>

      {cases.map((item, index) => (
        <fieldset
          key={index}
          disabled={running || disabled}
          style={{ marginBottom: 16 }}
        >
          <legend>Test case {index + 1}</legend>

          <div className="goal-field">
            <label htmlFor={`test-input-${index}`}>
              Input
            </label>

            <textarea
              id={`test-input-${index}`}
              rows={2}
              maxLength={4000}
              readOnly={Boolean(problem)}
              value={item.stdin}
              onChange={(event) =>
                updateCase(index, "stdin", event.target.value)
              }
            />
          </div>

          <div className="goal-field">
            <label htmlFor={`test-expected-${index}`}>
              Expected output
            </label>

            <textarea
              id={`test-expected-${index}`}
              rows={2}
              maxLength={4000}
              readOnly={Boolean(problem)}
              value={item.expected_output}
              onChange={(event) =>
                updateCase(
                  index,
                  "expected_output",
                  event.target.value
                )
              }
            />
          </div>

          {!problem && (
            <button
              type="button"
              disabled={running || disabled || cases.length === 1}
              onClick={() =>
                setCases((previous) =>
                  previous.filter((_, position) => position !== index)
                )
              }
            >
              Remove case
            </button>
          )}
        </fieldset>
      ))}

      <div className="actions">
        {!problem && (
          <button
            type="button"
            disabled={running || disabled || cases.length >= 3}
            onClick={() =>
              setCases((previous) => [
                ...previous,
                { stdin: "", expected_output: "" },
              ])
            }
          >
            Add test case
          </button>
        )}

        <button
          type="button"
          disabled={blocked}
          onClick={runTests}
        >
          {running ? "Running tests..." : "Run Tests"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {running && (
          <p className="muted">
            Running cases one at a time. Wait for completion
            before using the separate Run Code button.
          </p>
        )}

        {report && (
          <>
            <h3>
              Passed: {report.passed}/{report.total}
            </h3>

            <p>
              {report.problem?.title ?? "Custom tests"}
              {" · "}
              {report.submission.language}
              {" · "}
              {report.total_seconds.toFixed(2)} seconds
            </p>

            {stale && (
              <p className="error">
                Code, language or test cases changed. These results
                belong to the previous submission.
              </p>
            )}

            {report.results.map((item, index) => (
              <article className="issue" key={index}>
                <h4>
                  Case {index + 1}: {labels[item.status]}
                </h4>

                <p>Input</p>
                <pre className="test-report">
                  {item.stdin || "(Empty input)"}
                </pre>

                <p>Expected output</p>
                <pre className="test-report">
                  {item.expected_output || "(Empty output)"}
                </pre>

                <p>Actual program output</p>
                <pre className="test-report">
                  {item.actual_output ||
                    (item.execution?.phase === "run"
                      ? "(No output)"
                      : "(Program did not run)")}
                </pre>

                {item.execution?.phase === "compile" && (
                  <>
                    <p>Compilation / syntax-check messages</p>
                    <pre className="test-report">
                      {item.execution.output || "(No messages)"}
                    </pre>
                  </>
                )}

                {item.execution?.compile_output && (
                  <pre className="test-report">
                    {item.execution.compile_output}
                  </pre>
                )}

                {item.error && (
                  <p className="error">{item.error}</p>
                )}
              </article>
            ))}

            <details>
              <summary>View code used for these tests</summary>
              <pre className="test-report">
                {report.submission.code}
              </pre>
            </details>

            <p className="muted">{report.comparison}</p>
            <p className="muted">{report.notice}</p>

            <p className="muted">
              Passing these visible sample cases does not prove
              correctness for every valid input.
            </p>
          </>
        )}
      </div>
    </section>
  );
}