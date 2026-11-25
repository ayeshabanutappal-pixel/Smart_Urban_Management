import sys
from decimal import Decimal
from pathlib import Path
import pytest
from sqlalchemy.exc import IntegrityError

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.extensions import db
from app.models import (
    Complaint,
    ComplaintStatusLog,
    Notification,
    User,
    Worker,
)


@pytest.fixture()
def app():
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


def _create_user(name: str, email: str, role: str = "citizen") -> User:
    user = User(name=name, email=email, role=role, ward="Ward 4 - Greenpark Avenue")
    user.set_password("StrongPassword123!")
    db.session.add(user)
    db.session.flush()
    return user


def test_worker_model_defaults_validation_and_uniqueness(app):
    with app.app_context():
        worker = Worker(
            name="Ramesh Kumar",
            role_title="Senior Sanitation Supervisor",
            ward="Ward 4 - Greenpark Avenue",
            phone="+91 97401 33210",
            vehicle_code="EV-SAN-04",
        )
        db.session.add(worker)
        db.session.commit()

        assert worker.id is not None
        assert worker.availability == "Available"
        assert worker.is_active is True
        assert worker.created_at is not None

        serialized = worker.to_dict(active_tasks=2, completed_count=15)
        assert serialized["id"] == str(worker.id)
        assert serialized["vehicleCode"] == "EV-SAN-04"
        assert serialized["activeTasks"] == 2
        assert serialized["completedCount"] == 15

        duplicate_vehicle = Worker(
            name="Another Worker",
            role_title="Inspector",
            ward="Ward 1",
            phone="+91 90000 00001",
            vehicle_code="EV-SAN-04",
        )
        db.session.add(duplicate_vehicle)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        with pytest.raises(ValueError):
            Worker(
                name="Bad Avail",
                role_title="Crew",
                ward="Ward 1",
                phone="+91 90000 00002",
                vehicle_code="EV-BAD-01",
                availability="On Vacation",
            )


def test_complaint_model_relationships_decimals_and_validations(app):
    with app.app_context():
        citizen = _create_user("Aarav Sharma", "aarav@example.com", "citizen")
        worker = Worker(
            name="Lakshmi Devi",
            role_title="Bio-Compost Lead",
            ward="Ward 2 - Central Market",
            phone="+91 97401 44519",
            availability="On Duty",
            vehicle_code="BIO-TRK-11",
        )
        db.session.add(worker)
        db.session.flush()

        complaint = Complaint(
            ticket_code="WS-2026-1001",
            citizen_id=citizen.id,
            assigned_worker_id=None,
            title="Plastic waste beside bus stop",
            description="Overflowing plastic bottles blocking drainage curb.",
            category="Plastic",
            ai_detected=True,
            ai_confidence=94,
            severity="High",
            location_name="Greenpark Main Road",
            ward="Ward 4 - Greenpark Avenue",
            latitude=Decimal("12.974215"),
            longitude=Decimal("77.596812"),
            image_url="/uploads/complaints/ws-2026-1001.jpg",
            estimated_weight_kg=Decimal("19.50"),
        )
        db.session.add(complaint)
        db.session.commit()

        assert complaint.status == "Pending"
        assert complaint.assigned_worker_id is None
        assert complaint.latitude == Decimal("12.974215")
        assert complaint.estimated_weight_kg == Decimal("19.50")

        payload = complaint.to_dict()
        assert payload["id"] == "WS-2026-1001"
        assert payload["citizenId"] == str(citizen.id)
        assert payload["citizenName"] == "Aarav Sharma"
        assert payload["assignedWorkerId"] is None
        assert payload["coordinates"] == {"lat": 12.974215, "lng": 77.596812}
        assert payload["estimatedWeightKg"] == 19.5

        complaint.assigned_worker_id = worker.id
        complaint.status = "Assigned"
        db.session.commit()
        assert complaint.to_dict()["assignedWorkerName"] == "Lakshmi Devi"

        with pytest.raises(ValueError):
            complaint.category = "Hazardous"
        with pytest.raises(ValueError):
            complaint.status = "Cancelled"
        with pytest.raises(ValueError):
            complaint.severity = "Critical"
        with pytest.raises(ValueError):
            complaint.ai_confidence = 120
        with pytest.raises(ValueError):
            complaint.estimated_weight_kg = Decimal("-1.00")


def test_complaint_status_log_and_notification_scoping(app):
    with app.app_context():
        citizen = _create_user("Meera Nair", "meera@example.com", "citizen")
        admin = _create_user("Priya Menon", "priya@example.com", "admin")

        complaint = Complaint(
            ticket_code="WS-2026-1002",
            citizen_id=citizen.id,
            title="Market organic waste",
            description="Decomposing organic waste beside market gate.",
            category="Organic",
            location_name="Central Market Gate",
            ward="Ward 2 - Central Market",
            latitude=Decimal("12.968800"),
            longitude=Decimal("77.604100"),
            image_url="/uploads/complaints/ws-2026-1002.jpg",
            estimated_weight_kg=Decimal("32.25"),
        )
        db.session.add(complaint)
        db.session.flush()

        log1 = ComplaintStatusLog(
            complaint_id=complaint.id,
            changed_by_user_id=citizen.id,
            status="Pending",
            note="Initial report submitted.",
        )
        log2 = ComplaintStatusLog(
            complaint_id=complaint.id,
            changed_by_user_id=admin.id,
            status="Assigned",
            note="Dispatched sanitation team.",
        )
        db.session.add_all([log1, log2])

        citizen_notif = Notification(
            user_id=citizen.id,
            complaint_id=complaint.id,
            title="Worker Assigned",
            message="Sanitation crew dispatched to Central Market Gate.",
            type="assignment",
        )
        system_notif = Notification(
            user_id=admin.id,
            complaint_id=None,
            title="System Notice",
            message="Daily review reminder.",
            type="complaint",
        )
        db.session.add_all([citizen_notif, system_notif])
        db.session.commit()

        assert complaint.status_logs[0].status == "Pending"
        assert complaint.status_logs[1].status == "Assigned"

        # Notifications remain strictly scoped to recipient user_id
        citizen_notifications = Notification.query.filter_by(user_id=citizen.id).all()
        admin_notifications = Notification.query.filter_by(user_id=admin.id).all()
        assert len(citizen_notifications) == 1
        assert len(admin_notifications) == 1
        assert citizen_notifications[0].is_read is False
        assert citizen_notifications[0].to_dict()["complaintId"] == "WS-2026-1002"
        assert citizen_notifications[0].to_dict()["audience"] == "citizen"
        assert admin_notifications[0].complaint_id is None
        assert admin_notifications[0].to_dict()["complaintId"] is None
        assert admin_notifications[0].to_dict()["audience"] == "admin"

        with pytest.raises(ValueError):
            ComplaintStatusLog(
                complaint_id=complaint.id,
                changed_by_user_id=admin.id,
                status="InvalidStatus",
            )
        with pytest.raises(ValueError):
            Notification(
                user_id=citizen.id,
                title="Invalid",
                message="Bad type",
                type="unknown",
            )
