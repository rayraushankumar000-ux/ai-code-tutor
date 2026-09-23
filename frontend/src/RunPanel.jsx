import { useState } from "react";

const languages = {
  python: "Python",
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  c: "C",
  cpp: "C++",
};

const statusLabels = {
  completed: "Execution completed",
  compile_error: "Compilation / syntax-check error",
  execution_error: "Execution error",
  time_limit: "Time limit exceeded",
  output_limit: "Output limit exceeded",
};

function validTime(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

export default function RunPanel({ language, code }) {
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState("");

  const disabled =
    running ||
    !Object.hasOwn(languages, language) ||
    !code.trim() ||
    code.length > 4000 ||
    stdin.length > 4000;

  async function runCode() {
    if (disabled) return;

    const submission = { language, code, stdin };

    setRunning(true);
    setRunResult(null);
    setError("");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch("/api/run", {
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
            : "Execution request failed."
        );
      }

      if (
        typeof data?.output !== "string" ||
        !Object.hasOwn(statusLabels, data.status) ||
        !["compile", "run"].includes(data.phase) ||
        !validTime(data.total_seconds) ||
        (data.exit_code != null &&
          !Number.isInteger(data.exit_code)) ||
        (data.compile_seconds != null &&
          !validTime(data.compile_seconds)) ||
        (data.run_seconds != null &&
          !validTime(data.run_seconds)) ||
        (data.compile_output != null &&
          typeof data.compile_output !== "string") ||
        typeof data.output_truncated !== "boolean" ||
        typeof data.notice !== "string"
      ) {
        throw new Error("Unexpected execution response.");
      }

      setRunResult({
        ...data,
        submission,
        received_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Request timed out. Check Docker and the backend terminal."
          : err.message || "Could not run code."
      );
    } finally {
      clearTimeout(timer);
      setRunning(false);
    }
  }

  function downloadExecutionReport() {
    if (!runResult || running) return;

    setError("");

    const report = {
      report_version: 1,
      report_type: "execution",
      project: "AI Code Review and Programming Tutor",
      received_at: runResult.received_at,
      submission: runResult.submission,
      execution: {
        status: runResult.status,
        phase: runResult.phase,
        exit_code: runResult.exit_code ?? null,
        output: runResult.output,
        compile_output: runResult.compile_output ?? "",
        output_truncated: runResult.output_truncated,
        compile_seconds: runResult.compile_seconds ?? null,
        run_seconds: runResult.run_seconds ?? null,
        total_seconds: runResult.total_seconds,
        notice: runResult.notice,
      },
      notice:
        "This report records the backend execution response for the " +
        "included submission. It contains no AI review. Output is " +
        "program-generated text; printed PASS counts are not an " +
        "independent platform verdict. Successful execution does not " +
        "prove correctness for every input. This file is not digitally signed.",
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

      const timestamp = runResult.received_at.replace(/[:.]/g, "-");

      link.href = url;
      link.download =
        `execution-${runResult.submission.language}-${timestamp}.json`;

      document.body.appendChild(link);
      link.click();
    } catch {
      setError("Could not download the execution report. Try again.");
    } finally {
      link?.remove();

      if (url) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  const stale = Boolean(
    runResult &&
      (language !== runResult.submission.language ||
        code !== runResult.submission.code ||
        stdin !== runResult.submission.stdin)
  );

  return (
    <section className="panel execution-panel">
      <h2>Run Code</h2>

      <p className="muted">
        Selected language: {languages[language] ?? language}.
        {" "}Run a complete single-file console program.
        {" "}Execution is separate from AI review.
      </p>

      {language === "java" && (
        <p className="muted">
          Use class Main with public static void main(String[] args).
          {" "}Do not add a package declaration. Runner uses Java 17.
        </p>
      )}

      {(language === "c" || language === "cpp") && (
        <p className="muted">
          Include a main function that calls your code.
        </p>
      )}

      {(language === "javascript" || language === "typescript") && (
        <p className="muted">
          Code runs in Node.js, not a browser. Browser APIs such as
          {" "}prompt, window and document are unavailable.
        </p>
      )}

      <div className="goal-field">
        <label htmlFor="program-input">
          Standard input — use the format your program expects
        </label>

        <textarea
          id="program-input"
          rows={4}
          value={stdin}
          maxLength={4000}
          disabled={running}
          placeholder="Example: 5 3"
          onChange={(event) => setStdin(event.target.value)}
        />
      </div>

      <div className="actions">
        <button
          type="button"
          onClick={runCode}
          disabled={disabled}
        >
          {running ? "Running..." : "Run Code"}
        </button>

        <button
          type="button"
          onClick={downloadExecutionReport}
          disabled={!runResult || running}
        >
          Download Execution Report
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
            Compiling or running your submission...
          </p>
        )}

        {runResult && (
          <>
            <h3>{statusLabels[runResult.status]}</h3>

            <p>
              Language: {languages[runResult.submission.language]}
              {" · "}
              Stage: {runResult.phase}
              {" · "}
              Exit code: {runResult.exit_code ?? "Not available"}
            </p>

            <p className="muted">
              Result received:{" "}
              {new Date(runResult.received_at).toLocaleString()}
            </p>

            <p className="muted">
              Total before cleanup:{" "}
              {runResult.total_seconds.toFixed(2)} seconds

              {validTime(runResult.compile_seconds) && (
                <>
                  {" · "}Compile/check:{" "}
                  {runResult.compile_seconds.toFixed(2)} seconds
                </>
              )}

              {validTime(runResult.run_seconds) && (
                <>
                  {" · "}Run:{" "}
                  {runResult.run_seconds.toFixed(2)} seconds
                </>
              )}
            </p>

            {stale && (
              <p className="error">
                Editor or input changed. These results and the
                downloaded report belong to the previous submission.
                Run again to test your current code and input.
              </p>
            )}

            {runResult.compile_output && (
              <>
                <h4>Compiler messages</h4>
                <pre className="test-report">
                  {runResult.compile_output}
                </pre>
              </>
            )}

            <h4>Output and errors</h4>

            <pre className="test-report">
              {runResult.output || "(No output)"}
            </pre>

            {runResult.output_truncated && (
              <p className="error">
                Output exceeded the 32 KB limit and was truncated.
                The downloaded report also contains only the captured output.
              </p>
            )}

            <details>
              <summary>View submitted code and input</summary>

              <h4>Submitted code</h4>
              <pre className="test-report">
                {runResult.submission.code}
              </pre>

              <h4>Submitted input</h4>
              <pre className="test-report">
                {runResult.submission.stdin || "(No input)"}
              </pre>
            </details>

            <p className="muted">{runResult.notice}</p>

            <p className="muted">
              Download Execution Report saves this submission and its
              execution result. It does not include AI feedback.
            </p>
          </>
        )}
      </div>
    </section>
  );
}