from fastapi.testclient import TestClient

from backend.main import create_app


def test_empty_state_is_persisted_and_missing_measurements_remain_null(tmp_path):
    client = TestClient(create_app(tmp_path / "halo-test.sqlite3"))

    response = client.get("/api/halo/state")
    assert response.status_code == 200
    assert response.json()["data"]["checkIns"] == []

    state = response.json()["data"]
    state["checkIns"].append({
        "id": "checkin-test",
        "source": "participant-entered",
        "sleepHours": None,
        "stress": 6,
        "currentWorkload": None,
        "restingHeartRate": None,
        "bloodPressureSystolic": None,
        "bloodPressureDiastolic": None,
    })
    saved = client.put("/api/halo/state", json={"data": state})

    assert saved.status_code == 200
    assert client.get("/api/halo/state").json()["data"]["checkIns"][0]["sleepHours"] is None


def test_rejects_records_without_provenance(tmp_path):
    client = TestClient(create_app(tmp_path / "halo-test.sqlite3"))
    state = {
        "checkIns": [{"id": "checkin-test", "sleepHours": None}],
        "taskSessions": [],
        "tlxAssessments": [],
        "followUps": [],
        "researchReferences": [],
    }

    response = client.put("/api/halo/state", json={"data": state})

    assert response.status_code == 422
