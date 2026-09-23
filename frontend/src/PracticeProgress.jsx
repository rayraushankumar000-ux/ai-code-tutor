import { useEffect, useState } from "react";
import { problems } from "./problems.js";

const STORAGE_KEY = "ai-code-tutor-practice-progress-v1";

function readProgress() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};

  const data = JSON.parse(stored);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid saved progress.");
  }

  for (const [id, item] of Object.entries(data)) {
    if (
      !problems.some((problem) => problem.id === id) ||
      !item ||
      !Number.isInteger(item.passed) ||
      !Number.isInteger(item.total) ||
      item.total !== 3 ||
      item.passed < 0 ||
      item.passed > item.total ||
      typeof item.language !== "string" ||
      typeof item.received_at !== "string" ||
      !Number.isFinite(Date.parse(item.received_at))
    ) {
      throw new Error("Invalid saved progress.");
    }
  }

  return data;
}

export default function PracticeProgress({ latestReport }) {
  const [progress, setProgress] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      let updated = readProgress();

      const problem = problems.find(
        (item) => item.id === latestReport?.problem?.id
      );

      if (problem) {
        const entry = {
          passed: latestReport.passed,
          total: latestReport.total,
          language: latestReport.submission.language,
          received_at: latestReport.received_at,
        };

        const previous = updated[problem.id];

        if (
          !previous ||
          Date.parse(entry.received_at) > Date.parse(previous.received_at)
        ) {
          updated = {
            ...updated,
            [problem.id]: entry,
          };

          setProgress(updated);

          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setError("");
          } catch {
            setError(
              "Progress is visible, but could not be saved in this browser."
            );
          }

          return;
        }
      }

      setProgress(updated);
      setError("");
    } catch {
      setError(
        "Could not read saved progress. Existing data was not overwritten."
      );
    }
  }, [latestReport]);

  const passedProblems = problems.filter((problem) => {
    const entry = progress[problem.id];
    return entry && entry.passed === entry.total;
  }).length;

  return (
    <section className="panel execution-panel">
      <h2>Practice progress</h2>

      <p>
        All sample tests passed on latest attempt:{" "}
        <strong>{passedProblems}/{problems.length} problems</strong>
      </p>

      <p className="muted">
        Shows the latest practice-test result for each question.
        Saved in this browser. Passing sample tests does not prove
        correctness for every input.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {problems.map((problem) => {
        const entry = progress[problem.id];

        return (
          <article className="issue" key={problem.id}>
            <div className="issue-heading">
              <strong>{problem.title}</strong>

              <span>
                {!entry
                  ? "Not attempted"
                  : entry.passed === entry.total
                    ? "All sample tests passed"
                    : "Needs another attempt"}
              </span>
            </div>

            {entry && (
              <p>
                Latest result: {entry.passed}/{entry.total}
                {" · "}
                {entry.language}
                {" · "}
                {new Date(entry.received_at).toLocaleString()}
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}