import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "ai-code-tutor-history-v1";
const HISTORY_LIMIT = 20;
const MAX_FILE_SIZE = 1024 * 1024;

const LANGUAGES = [
  "python",
  "java",
  "javascript",
  "typescript",
  "c",
  "cpp",
];

function validateReview(report) {
  const submission = report?.submission;

  if (
    !report ||
    typeof report.received_at !== "string" ||
    !Number.isFinite(Date.parse(report.received_at)) ||
    !LANGUAGES.includes(submission?.language) ||
    !["review", "hint"].includes(submission?.mode) ||
    typeof submission?.code !== "string" ||
    typeof submission?.goal !== "string" ||
    typeof report.feedback !== "string" ||
    typeof report.verification !== "string" ||
    typeof report.truncated !== "boolean" ||
    !["model", "fallback", "unknown"].includes(
      report.feedback_source
    )
  ) {
    throw new Error("Invalid review format.");
  }

  if (
    report.model != null &&
    (
      typeof report.model !== "string" ||
      !report.model.trim()
    )
  ) {
    throw new Error("Invalid model name.");
  }

  if (
    report.response_time_seconds != null &&
    (
      typeof report.response_time_seconds !== "number" ||
      !Number.isFinite(report.response_time_seconds) ||
      report.response_time_seconds < 0
    )
  ) {
    throw new Error("Invalid response time.");
  }

  const checks = report.checks;

  if (checks != null) {
    if (
      typeof checks.syntax_valid !== "boolean" ||
      !Number.isInteger(checks.issue_count) ||
      !Array.isArray(checks.issues) ||
      checks.issue_count !== checks.issues.length
    ) {
      throw new Error("Invalid static findings.");
    }

    for (const issue of checks.issues) {
      if (
        !issue ||
        typeof issue.rule !== "string" ||
        typeof issue.message !== "string" ||
        ![issue.line, issue.column].every(
          (value) =>
            value == null ||
            (Number.isInteger(value) && value >= 0)
        )
      ) {
        throw new Error("Invalid static issue.");
      }
    }
  }

  return {
    received_at: report.received_at,
    model: report.model ?? null,
    response_time_seconds: report.response_time_seconds ?? null,
    submission: {
      language: submission.language,
      code: submission.code,
      goal: submission.goal,
      mode: submission.mode,
    },
    feedback_source: report.feedback_source,
    feedback: report.feedback,
    checks: checks ?? null,
    truncated: report.truncated,
    verification: report.verification,
  };
}

function readHistory() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const parsed = stored ? JSON.parse(stored) : [];

  if (!Array.isArray(parsed)) {
    throw new Error("Saved history has an invalid format.");
  }

  return parsed.map(validateReview);
}

function sameReview(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function formatResponseTime(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? `${value.toFixed(2)} seconds`
    : "Not recorded";
}

function exportReport(review) {
  return {
    report_version: 1,
    project: "AI Code Review and Programming Tutor",
    received_at: review.received_at,
    submission: review.submission,
    response: {
      model: review.model ?? null,
      response_time_seconds: review.response_time_seconds ?? null,
      feedback_source: review.feedback_source,
      feedback: review.feedback,
      checks: review.checks,
      truncated: review.truncated,
      verification: review.verification,
    },
    notice:
      review.feedback_source === "fallback"
        ? "General debugging template, not an AI-generated diagnosis."
        : "AI suggestions can be incorrect. Suggested code has not been executed or verified.",
  };
}

export default function ReviewHistory({ result }) {
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  const fileInput = useRef(null);

  useEffect(() => {
    try {
      let updated = readHistory();

      if (result) {
        const review = validateReview(result);

        updated = [
          review,
          ...updated.filter((item) => !sameReview(item, review)),
        ].slice(0, HISTORY_LIMIT);
      }

      setHistory(updated);
      setError("");
      setMessage("");

      if (result) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(updated)
          );
        } catch {
          setError(
            "The latest review could not be saved. Download it to keep a copy."
          );
        }
      }
    } catch {
      setError(
        "Could not read or update history. Existing saved data was not overwritten."
      );
    }
  }, [result]);

  async function importReview(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError("");
    setMessage("");
    setImporting(true);

    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Choose a JSON report no larger than 1 MB.");
      }

      const text = await file.text();
      let importedReport;

      try {
        importedReport = JSON.parse(
          text.replace(/^\uFEFF/, "")
        );
      } catch {
        throw new Error("This file does not contain valid JSON.");
      }

      if (
        importedReport?.report_version !== 1 ||
        importedReport?.project !==
          "AI Code Review and Programming Tutor" ||
        !importedReport.response ||
        typeof importedReport.response !== "object" ||
        Array.isArray(importedReport.response)
      ) {
        throw new Error(
          "Choose a report downloaded using Download Review."
        );
      }

      const review = validateReview({
        ...importedReport.response,
        received_at: importedReport.received_at,
        submission: importedReport.submission,
      });

      let existing;

      try {
        existing = readHistory();
      } catch {
        throw new Error(
          "Could not read existing history. Import stopped to avoid overwriting it."
        );
      }

      if (existing.some((item) => sameReview(item, review))) {
        setHistory(existing);
        setSelected(review);
        setMessage("This review is already in history.");
        return;
      }

      const updated = [review, ...existing].slice(
        0,
        HISTORY_LIMIT
      );

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(updated)
        );
      } catch {
        throw new Error(
          "Could not save the imported review. Browser storage may be full or unavailable."
        );
      }

      setHistory(updated);
      setSelected(review);
      setMessage("Review imported and saved successfully.");
    } catch (err) {
      setError(err.message || "Could not import this report.");
    } finally {
      setImporting(false);
    }
  }

  function clearHistory() {
    if (!window.confirm("Delete all saved review history?")) {
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
      setHistory([]);
      setSelected(null);
      setError("");
      setMessage("History cleared.");
    } catch {
      setError("Could not clear browser history.");
    }
  }

  function downloadSavedReview(review) {
    const blob = new Blob(
      [JSON.stringify(exportReport(review), null, 2)],
      { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `saved-review-${review.received_at.replace(/[:.]/g, "-")}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <h2>Review history</h2>

        <div className="actions">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import Review"}
          </button>

          <button
            type="button"
            onClick={clearHistory}
            disabled={
              importing || (history.length === 0 && !error)
            }
          >
            Clear history
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        onChange={importReview}
        hidden
      />

      <p className="muted">
        Last 20 reviews and hints are saved in this browser,
        including submitted code. Import a downloaded JSON report
        to restore it. Older entries are removed at the limit.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}

      {history.length === 0 && (
        <p className="muted">
          No saved reviews. Run a review or import a report.
        </p>
      )}

      <div className="history-list">
        {history.map((item, index) => (
          <article
            className="issue"
            key={`${item.received_at}-${index}`}
          >
            <div className="issue-heading">
              <strong>
                {item.submission.language} · {item.submission.mode}
              </strong>

              <span>
                {new Date(item.received_at).toLocaleString()}
              </span>
            </div>

            <p>{item.submission.goal || "No goal provided"}</p>

            <p className="muted">
              Model used: {item.model ?? "Not recorded"}
              {" · "}
              AI request time:{" "}
              {formatResponseTime(item.response_time_seconds)}
            </p>

            <div className="actions">
              <button
                type="button"
                onClick={() => setSelected(item)}
              >
                View saved review
              </button>

              <button
                type="button"
                onClick={() => downloadSavedReview(item)}
              >
                Download
              </button>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="saved-review" aria-live="polite">
          <div className="panel-heading">
            <h3>Saved review details</h3>

            <button
              type="button"
              onClick={() => setSelected(null)}
            >
              Close details
            </button>
          </div>

          <p>
            {selected.submission.language} ·{" "}
            {selected.submission.mode} ·{" "}
            {new Date(selected.received_at).toLocaleString()}
          </p>

          <p>
            Goal: {selected.submission.goal || "Not provided"}
          </p>

          <p className="muted">
            Model used: {selected.model ?? "Not recorded"}
            {" · "}
            AI request time:{" "}
            {formatResponseTime(selected.response_time_seconds)}
          </p>

          {selected.response_time_seconds != null && (
            <p className="muted">
              AI request time includes the Ollama request and
              response parsing; Python static-check time is excluded.
            </p>
          )}

          <h4>Submitted code</h4>

          <pre className="test-report">
            {selected.submission.code}
          </pre>

          <p className="muted">{selected.verification}</p>

          {selected.checks && (
            <>
              <h4>Saved static findings</h4>

              <p>
                Syntax:{" "}
                {selected.checks.syntax_valid ? "Valid" : "Invalid"}
                {" · "}
                {selected.checks.issue_count}{" "}
                {selected.checks.issue_count === 1
                  ? "issue"
                  : "issues"}
              </p>

              {selected.checks.issues.map((issue, index) => (
                <p key={index}>
                  <strong>{issue.rule}</strong>
                  {" — "}
                  Line {issue.line ?? "?"}, column{" "}
                  {issue.column ?? "?"}: {issue.message}
                </p>
              ))}
            </>
          )}

          <h4>
            {selected.feedback_source === "fallback"
              ? "General debugging hint (template)"
              : selected.feedback_source === "model"
                ? "Saved AI feedback"
                : "Saved feedback (source unknown)"}
          </h4>

          <pre className="ai-feedback">
            {selected.feedback}
          </pre>

          {selected.truncated && (
            <p className="error">
              This saved response reached its length limit.
            </p>
          )}

          <p className="muted">
            Saved and imported reports are historical records.
            Importing does not verify their authenticity, execute
            code, or generate a new review. AI suggestions may
            be incorrect.
          </p>
        </div>
      )}
    </section>
  );
}