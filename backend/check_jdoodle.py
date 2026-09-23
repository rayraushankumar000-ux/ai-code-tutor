"""Run once from the backend folder to check hosted execution credentials."""
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv


def main():
    load_dotenv(Path(__file__).resolve().parent / ".env")
    client_id = os.getenv("JDOODLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("JDOODLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print("Missing credentials. Add both JDoodle values to backend/.env.")
        return 1

    try:
        response = httpx.post(
            "https://api.jdoodle.com/v1/execute",
            json={
                "clientId": client_id,
                "clientSecret": client_secret,
                "language": "python3",
                "versionIndex": "0",
                "script": "print(5 + 3)",
                "stdin": "",
            },
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        if response.status_code in (401, 403):
            print("Credentials were rejected. Check your JDoodle dashboard.")
            return 1
        if response.status_code == 429:
            print("JDoodle quota or rate limit reached. Try after it resets.")
            return 1
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Invalid response")

        # Print only diagnostic fields, never credentials or raw error bodies.
        allowed = (
            "statusCode", "output", "cpuTime", "memory",
            "compilationStatus", "exitCode", "isExecutionSuccess",
        )
        safe = {key: data[key] for key in allowed if key in data}
        displayed = json.dumps(safe, indent=2, ensure_ascii=False)
        for secret in (client_id, client_secret):
            displayed = displayed.replace(secret, "[REDACTED]")
        print(displayed[:8000])

        if data.get("statusCode") == 200 and str(data.get("output", "")).strip() == "8":
            print("Connection test passed: JDoodle returned the expected output 8.")
            return 0
        print("Connection test did not return the expected result. Check account settings.")
        return 1
    except httpx.TimeoutException:
        print("JDoodle request timed out. Do not retry repeatedly; a run may use a credit.")
    except httpx.HTTPError:
        print("Could not reach JDoodle successfully. Check your internet and account.")
    except ValueError:
        print("JDoodle returned an unexpected response format.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
