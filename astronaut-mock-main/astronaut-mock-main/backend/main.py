import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

PROVENANCE = {"synthetic-demo", "participant-entered", "external-nasa-osdr"}
RECORD_LISTS = ("checkIns", "taskSessions", "tlxAssessments", "followUps", "researchReferences")
EMPTY_STATE: dict[str, Any] = {
    "checkIns": [],
    "taskSessions": [],
    "tlxAssessments": [],
    "followUps": [],
    "researchReferences": [],
    "checkInDisposition": None,
    "reviewedTrendDates": [],
}


class StateEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: dict[str, Any]


def validate_state(data: dict[str, Any]) -> None:
    for collection in RECORD_LISTS:
        records = data.get(collection)
        if not isinstance(records, list):
            raise HTTPException(status_code=422, detail=f"{collection} must be a list.")
        for index, record in enumerate(records):
            if not isinstance(record, dict):
                raise HTTPException(status_code=422, detail=f"{collection}[{index}] must be an object.")
            if record.get("source") not in PROVENANCE:
                raise HTTPException(status_code=422, detail=f"{collection}[{index}] must include a valid provenance source.")
            if collection == "researchReferences" and record["source"] != "external-nasa-osdr":
                raise HTTPException(status_code=422, detail=f"{collection}[{index}] must use external-nasa-osdr provenance.")

    check_in_fields = (
        "sleepHours",
        "stress",
        "currentWorkload",
        "restingHeartRate",
        "bloodPressureSystolic",
        "bloodPressureDiastolic",
    )
    for index, record in enumerate(data["checkIns"]):
        for field in check_in_fields:
            value = record.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise HTTPException(status_code=422, detail=f"checkIns[{index}].{field} must be a number or null.")
    if "reviewedTrendDates" in data and (
        not isinstance(data["reviewedTrendDates"], list)
        or not all(isinstance(date, str) for date in data["reviewedTrendDates"])
    ):
        raise HTTPException(status_code=422, detail="reviewedTrendDates must be a list of date strings.")


def create_app(database_path: Path | None = None) -> FastAPI:
    if database_path is None:
        configured_path = os.environ.get("HALO_DB_PATH")
        database_path = Path(configured_path) if configured_path else Path(__file__).with_name("halo.sqlite3")
    database_path = database_path.resolve()

    app = FastAPI(title="HALO Local Mission Log API", version="1.0.0")
    origins = os.environ.get("HALO_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["GET", "PUT", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    def open_database() -> sqlite3.Connection:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path)
        connection.execute(
            "CREATE TABLE IF NOT EXISTS mission_state ("
            "id INTEGER PRIMARY KEY CHECK (id = 1), "
            "data_json TEXT NOT NULL, "
            "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        return connection

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/halo/state")
    def get_state() -> dict[str, Any]:
        with open_database() as connection:
            row = connection.execute("SELECT data_json FROM mission_state WHERE id = 1").fetchone()
        return {"data": json.loads(row[0]) if row else EMPTY_STATE}

    @app.put("/api/halo/state")
    def put_state(envelope: StateEnvelope) -> dict[str, Any]:
        validate_state(envelope.data)
        serialized = json.dumps(envelope.data, allow_nan=False, separators=(",", ":"))
        with open_database() as connection:
            connection.execute(
                "INSERT INTO mission_state (id, data_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) "
                "ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP",
                (serialized,),
            )
        return {"saved": True}

    return app


app = create_app()
