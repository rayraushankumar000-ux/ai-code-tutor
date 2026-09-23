import json
import math
import os
import threading
from pathlib import Path
from time import perf_counter
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


load_dotenv(Path(__file__).resolve().parent / ".env")

router = APIRouter()

JDOODLE_URL = "https://api.jdoodle.com/v1/execute"

OUTPUT_LIMIT = 32 * 1024
RESPONSE_LIMIT = 2 * 1024 * 1024

RUN_SLOT = threading.BoundedSemaphore(1)

Language = Literal[
    "python",
    "java",
    "javascript",
    "typescript",
    "c",
    "cpp",
]

# JDoodle language IDs and pinned version indices.
LANGUAGES = {
    "python": ("python3", "5"),
    "java": ("java", "4"),
    "javascript": ("nodejs", "5"),
    "typescript": ("typescript", "1"),
    "c": ("c", "6"),
    "cpp": ("cpp17", "2"),
}


class RunRequest(BaseModel):
    language: Language
    code: str = Field(min_length=1, max_length=4000)
    stdin: str = Field(default="", max_length=4000)


class TestCase(BaseModel):
    stdin: str = Field(default="", max_length=4000)
    expected_output: str = Field(max_length=4000)


class TestRequest(BaseModel):
    language: Language
    code: str = Field(min_length=1, max_length=4000)
    cases: list[TestCase] = Field(min_length=1, max_length=3)


def check_service_status(status):
    if status in (401, 403, "401", "403"):
        raise HTTPException(
            status_code=503,
            detail=(
                "JDoodle credentials rejected. "
                "Check backend environment settings."
            ),
        )

    if status in (429, "429"):
        raise HTTPException(
            status_code=429,
            detail=(
                "JDoodle quota or rate limit reached. "
                "Try after it resets."
            ),
        )


def call_provider(request: RunRequest):
    client_id = os.getenv(
        "JDOODLE_CLIENT_ID", ""
    ).strip()

    client_secret = os.getenv(
        "JDOODLE_CLIENT_SECRET", ""
    ).strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "Add JDoodle credentials to backend/.env "
                "or the server environment."
            ),
        )

    provider_language, version_index = LANGUAGES[
        request.language
    ]

    payload = {
        "clientId": client_id,
        "clientSecret": client_secret,
        "script": request.code,
        "stdin": request.stdin,
        "language": provider_language,
        "versionIndex": version_index,
    }

    try:
        # No automatic retries: retries can consume more credits.
        with httpx.Client(
            timeout=httpx.Timeout(
                60.0,
                connect=10.0,
            )
        ) as client:
            with client.stream(
                "POST",
                JDOODLE_URL,
                json=payload,
            ) as response:
                check_service_status(response.status_code)
                response.raise_for_status()

                body = bytearray()

                for chunk in response.iter_bytes():
                    if len(body) + len(chunk) > RESPONSE_LIMIT:
                        raise HTTPException(
                            status_code=502,
                            detail=(
                                "JDoodle response exceeded "
                                "the download limit."
                            ),
                        )

                    body.extend(chunk)

        data = json.loads(body)

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=(
                "JDoodle request timed out. "
                "Program outcome is unknown. "
                "A credit may have been used."
            ),
        )

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail=(
                "JDoodle request failed. Check service "
                "availability and account settings."
            ),
        )

    except (ValueError, UnicodeError):
        raise HTTPException(
            status_code=502,
            detail="JDoodle returned invalid JSON.",
        )

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="JDoodle returned an invalid response.",
        )

    check_service_status(data.get("statusCode"))

    if (
        data.get("statusCode") not in (200, "200")
        or data.get("error")
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "JDoodle rejected the execution request. "
                "Check account and language settings."
            ),
        )

    return data


def number_or_none(value):
    if isinstance(value, bool):
        return None

    try:
        number = float(value)

        if math.isfinite(number) and number >= 0:
            return number

    except (TypeError, ValueError):
        pass

    return None


def convert_result(language, data, started_at):
    output = data.get("output")

    if not isinstance(output, str):
        raise HTTPException(
            status_code=502,
            detail=(
                "JDoodle response did not contain "
                "output text."
            ),
        )

    compilation_status = data.get("compilationStatus")
    success = data.get("isExecutionSuccess")

    # HTTP 200 means the API request succeeded.
    # It does not prove the submitted program succeeded.
    if (
        compilation_status == 1
        and not isinstance(compilation_status, bool)
    ):
        status = "compile_error"
        phase = "compile"

    elif success is True:
        status = "completed"
        phase = "run"

    elif success is False:
        status = "execution_error"
        phase = "run"

    else:
        raise HTTPException(
            status_code=502,
            detail=(
                "JDoodle did not confirm program success "
                "or failure. No test verdict was assigned."
            ),
        )

    output_bytes = output.encode("utf-8")
    output_truncated = len(output_bytes) > OUTPUT_LIMIT

    if output_truncated:
        status = "output_limit"
        output = output_bytes[:OUTPUT_LIMIT].decode(
            "utf-8",
            errors="ignore",
        )

    exit_code = data.get("exitCode")

    # Do not invent an exit code when the provider omits it.
    if type(exit_code) is not int:
        exit_code = None

    if (
        status == "completed"
        and exit_code not in (None, 0)
    ):
        status = "execution_error"

    return {
        "language": language,
        "provider": "jdoodle",
        "status": status,
        "phase": phase,
        "exit_code": exit_code,
        "execution_success": (
            success is True and status == "completed"
        ),
        "output": output,
        "output_truncated": output_truncated,
        "compile_output": "",
        "compile_seconds": None,
        "run_seconds": None,
        "provider_cpu_seconds": number_or_none(
            data.get("cpuTime")
        ),
        "total_seconds": round(
            perf_counter() - started_at,
            3,
        ),
        "notice": (
            "Code and input were sent to JDoodle for "
            "hosted execution. Total time measures the API "
            "request, including network overhead. Separate "
            "compile/run wall times and exit code may be "
            "unavailable. Provider-reported failures may "
            "combine compilation, runtime and timeout errors; "
            "read the output for details. Output is limited "
            "locally to 32 KB. Successful execution does not "
            "prove correctness for all inputs."
        ),
    }


def execute(request: RunRequest):
    started_at = perf_counter()

    data = call_provider(request)

    return convert_result(
        request.language,
        data,
        started_at,
    )


def acquire_slot(code: str):
    if not code.strip():
        raise HTTPException(
            status_code=400,
            detail="Please enter code.",
        )

    if not RUN_SLOT.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail=(
                "Another execution or test batch is running. "
                "Try again shortly."
            ),
        )


@router.post("/run")
def run_code(request: RunRequest):
    acquire_slot(request.code)

    try:
        return execute(request)

    finally:
        RUN_SLOT.release()


def normalize_test_output(text: str):
    return (
        text.replace("\r\n", "\n")
        .replace("\r", "\n")
        .rstrip("\n")
    )


@router.post("/run-tests")
def run_tests(request: TestRequest):
    acquire_slot(request.code)

    started_at = perf_counter()
    results = []
    stopped = False

    try:
        for index, case in enumerate(
            request.cases,
            start=1,
        ):
            row = {
                "case_number": index,
                "stdin": case.stdin,
                "expected_output": case.expected_output,
                "actual_output": "",
                "status": "not_run",
                "execution": None,
                "error": None,
            }

            if stopped:
                row["error"] = (
                    "Not run after an earlier service "
                    "or compilation failure."
                )
                results.append(row)
                continue

            try:
                execution = execute(
                    RunRequest(
                        language=request.language,
                        code=request.code,
                        stdin=case.stdin,
                    )
                )

            except HTTPException as error:
                row["status"] = "runner_error"
                row["error"] = str(error.detail)

                results.append(row)
                stopped = True
                continue

            row["execution"] = execution
            row["actual_output"] = execution["output"]

            if (
                execution["execution_success"]
                and not execution["output_truncated"]
            ):
                matches = (
                    normalize_test_output(
                        execution["output"]
                    )
                    == normalize_test_output(
                        case.expected_output
                    )
                )

                row["status"] = (
                    "passed" if matches else "wrong_answer"
                )

            else:
                row["status"] = execution["status"]

            results.append(row)

            if execution["phase"] == "compile":
                stopped = True

    finally:
        RUN_SLOT.release()

    passed = sum(
        row["status"] == "passed"
        for row in results
    )

    return {
        "language": request.language,
        "provider": "jdoodle",
        "passed": passed,
        "total": len(request.cases),
        "all_passed": passed == len(request.cases),
        "results": results,
        "total_seconds": round(
            perf_counter() - started_at,
            3,
        ),
        "comparison": (
            "Text comparison ignores line-ending differences "
            "and trailing newlines. Spaces and internal "
            "blank lines must match."
        ),
        "notice": (
            "Each attempted case makes a separate JDoodle "
            "request and uses execution credits. A pass "
            "requires provider-reported execution success "
            "and matching output. Returned output can contain "
            "diagnostics. Results apply only to the supplied "
            "cases. Times include network overhead. Code is "
            "not executed on this backend."
        ),
    }