import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

const MARKER_OWNER = "python-live-check";

export default function LiveCodeEditor({
  value,
  language,
  onChange,
  ...editorProps
}) {
  const [instance, setInstance] = useState(null);
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    if (!instance) return;

    const { editor, monaco } = instance;
    const model = editor.getModel();

    if (!model || model.isDisposed()) return;

    monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    setIssues([]);

    if (language !== "python") {
      setStatus(
        "Live backend checks are currently available for Python only."
      );
      return;
    }

    if (!value.trim()) {
      setStatus("Type Python code to start live checking.");
      return;
    }

    if (value.length > 4000) {
      setStatus("Live checking supports up to 4,000 characters.");
      return;
    }

    const controller = new AbortController();
    const version = model.getVersionId();
    let active = true;
    let requestTimeout;

    function isCurrent() {
      return (
        active &&
        !model.isDisposed() &&
        editor.getModel() === model &&
        model.getVersionId() === version &&
        model.getValue() === value &&
        model.getLanguageId() === "python"
      );
    }

    setStatus("Waiting for typing to pause...");

    const debounceTimer = setTimeout(async () => {
      if (!isCurrent()) return;

      setStatus("Checking Python code...");

      requestTimeout = setTimeout(
        () => controller.abort(),
        15000
      );

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: value }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "Live check failed. Check the backend."
          );
        }

        if (
          !Array.isArray(data?.issues) ||
          typeof data.syntax_valid !== "boolean"
        ) {
          throw new Error("Invalid live-check response.");
        }

        if (!isCurrent()) return;

        const markers = data.issues.map((issue) => {
          const requestedLine = Number.isInteger(issue.line)
            ? issue.line
            : 1;

          const line = Math.max(
            1,
            Math.min(requestedLine, model.getLineCount())
          );

          const maxColumn = model.getLineMaxColumn(line);
          const requestedColumn = Number.isInteger(issue.column)
            ? issue.column
            : 1;

          const column = Math.max(
            1,
            Math.min(requestedColumn, maxColumn)
          );

          const word = model.getWordAtPosition({
            lineNumber: line,
            column,
          });

          const serious =
            issue.rule === "SYNTAX" || issue.rule === "F821";

          return {
            startLineNumber: line,
            endLineNumber: line,
            startColumn: word?.startColumn ?? column,
            endColumn:
              word?.endColumn ??
              Math.min(column + 1, maxColumn),
            message: `${issue.rule}: ${issue.message}`,
            severity: serious
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
            source: issue.rule === "SYNTAX" ? "Python syntax" : "Ruff",
          };
        });

        monaco.editor.setModelMarkers(
          model,
          MARKER_OWNER,
          markers
        );

        setIssues(data.issues);

        if (!data.syntax_valid) {
          setStatus("Syntax error found. Lint checks were skipped.");
        } else if (data.issues.length > 0) {
          setStatus(
            `${data.issues.length} static issue(s) found.`
          );
        } else {
          setStatus(
            "No issues found by enabled checks. Logic is not verified."
          );
        }
      } catch (err) {
        if (!isCurrent()) return;

        setStatus(
          err.name === "AbortError"
            ? "Live check timed out. Edit the code to retry."
            : err.message || "Could not check code."
        );
      } finally {
        clearTimeout(requestTimeout);
      }
    }, 1000);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
      clearTimeout(requestTimeout);
      controller.abort();

      if (!model.isDisposed()) {
        monaco.editor.setModelMarkers(
          model,
          MARKER_OWNER,
          []
        );
      }
    };
  }, [value, language, instance]);

  function handleChange(nextValue) {
    const model = instance?.editor.getModel();

    if (model && !model.isDisposed()) {
      instance.monaco.editor.setModelMarkers(
        model,
        MARKER_OWNER,
        []
      );
    }

    setIssues([]);
    onChange?.(nextValue ?? "");
  }

  return (
    <>
      <Editor
        {...editorProps}
        value={value}
        language={language}
        onChange={handleChange}
        onMount={(editor, monaco) => {
          setInstance({ editor, monaco });
        }}
      />

      <div className="live-check-panel" aria-live="polite">
        <strong>Live code checks</strong>
        <p className="muted">{status}</p>

        {issues.length > 0 && (
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                <strong>{issue.rule}</strong>
                {" — "}
                Line {issue.line ?? "?"}: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}