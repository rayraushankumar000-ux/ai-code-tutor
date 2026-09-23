import { useState } from "react";

const experiments = [
  {
    id: "java-maximum",
    label: "Maximum logic bug — original vs corrected",
  },
  {
    id: "java-redundant",
    label: "Redundant condition — original vs simplified",
  },
];

export default function VerificationPanel() {
  const [experiment, setExperiment] = useState("java-maximum");
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadEvidence() {
    setLoading(true);
    setError("");
    setEvidence(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `/api/verification/${experiment}`,
        { signal: controller.signal }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Could not load the test report."
        );
      }

      if (typeof data?.report !== "string") {
        throw new Error("Invalid test report response.");
      }

      setEvidence(data);
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Request timed out. Check the backend."
          : err.message
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <section className="panel verification-panel">
      <h2>Java experiments: saved test evidence</h2>

      <p className="muted">
        Select an experiment to view its previously saved results.
        Loading a report does not run code.
      </p>

      <div className="goal-field">
        <label htmlFor="verification-experiment">
          Experiment
        </label>

        <select
          id="verification-experiment"
          value={experiment}
          disabled={loading}
          onChange={(event) => {
            setExperiment(event.target.value);
            setEvidence(null);
            setError("");
          }}
        >
          {experiments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="actions">
        <button onClick={loadEvidence} disabled={loading}>
          {loading ? "Loading..." : "Load saved test report"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {evidence && (
          <>
            <h3>{evidence.title}</h3>
            <p>Report file: {evidence.report_file}</p>

            <pre className="test-report">
              {evidence.report}
            </pre>

            <p>{evidence.context}</p>
            <p className="muted">{evidence.notice}</p>
          </>
        )}
      </div>
    </section>
  );
}