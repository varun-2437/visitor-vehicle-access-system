import sys
import os
import uuid
from datetime import datetime, timedelta

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import User, VisitorPass, AccessLog, UserRole, PassStatus, LogAction
from auth import hash_password
from routes.qr import generate_qr_code_file

def seed_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        now = datetime.utcnow()

        # 1. Admin User
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@vvas.local",
                hashed_password=hash_password("admin123"),
                full_name="System Administrator",
                role=UserRole.admin,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        # 2. Key Residents
        varun = db.query(User).filter(User.username == "varun").first()
        if not varun:
            varun = User(
                username="varun",
                email="varun@test.com",
                hashed_password=hash_password("pass123"),
                full_name="Varun M",
                role=UserRole.resident,
                flat_number="A-101",
            )
            db.add(varun)

        priya = db.query(User).filter(User.username == "priya").first()
        if not priya:
            priya = User(
                username="priya",
                email="priya@test.com",
                hashed_password=hash_password("pass123"),
                full_name="Priya Sharma",
                role=UserRole.resident,
                flat_number="B-204",
            )
            db.add(priya)

        anand = db.query(User).filter(User.username == "anand").first()
        if not anand:
            anand = User(
                username="anand",
                email="anand@test.com",
                hashed_password=hash_password("pass123"),
                full_name="Anand Mehta",
                role=UserRole.resident,
                flat_number="C-302",
            )
            db.add(anand)

        # 3. Guards
        guard1 = db.query(User).filter(User.username == "guard1").first()
        if not guard1:
            guard1 = User(
                username="guard1",
                email="guard1@test.com",
                hashed_password=hash_password("pass123"),
                full_name="Security Ram",
                role=UserRole.guard,
            )
            db.add(guard1)

        guard2 = db.query(User).filter(User.username == "guard2").first()
        if not guard2:
            guard2 = User(
                username="guard2",
                email="guard2@test.com",
                hashed_password=hash_password("pass123"),
                full_name="Security Shyam",
                role=UserRole.guard,
            )
            db.add(guard2)

        db.commit()
        db.refresh(admin)
        db.refresh(varun)
        db.refresh(priya)
        db.refresh(anand)
        db.refresh(guard1)
        if guard2:
            db.refresh(guard2)
        else:
            guard2 = guard1

        # 4. Fresh sample passes covering every status
        sample_passes = [
            {
                "visitor_name": "Aarav Sharma",
                "vehicle_number": "DL2CAY3180",
                "purpose": "Guest Visit / Meeting",
                "resident_id": varun.id,
                "status": PassStatus.not_inside,
                "created_at": now - timedelta(hours=2),
                "expires_at": now + timedelta(hours=22),
                "logs": []
            },
            {
                "visitor_name": "Ramesh Kumar",
                "vehicle_number": "MH12DE1433",
                "purpose": "Grocery & Parcel Delivery",
                "resident_id": varun.id,
                "status": PassStatus.in_campus,
                "created_at": now - timedelta(hours=3),
                "expires_at": now + timedelta(hours=21),
                "logs": [
                    {"action": LogAction.entry, "scanned_by": guard1.id, "time": now - timedelta(hours=1)}
                ]
            },
            {
                "visitor_name": "Sunil Verma",
                "vehicle_number": "TN43F6967",
                "purpose": "Air Conditioner Repair",
                "resident_id": varun.id,
                "status": PassStatus.exited,
                "created_at": now - timedelta(hours=5),
                "expires_at": now + timedelta(hours=19),
                "logs": [
                    {"action": LogAction.entry, "scanned_by": guard1.id, "time": now - timedelta(hours=4)},
                    {"action": LogAction.exit, "scanned_by": guard2.id, "time": now - timedelta(minutes=45)}
                ]
            },
            {
                "visitor_name": "Kavita Reddy",
                "vehicle_number": "KA04MH2021",
                "purpose": "Family Relative Visit",
                "resident_id": priya.id,
                "status": PassStatus.not_inside,
                "created_at": now - timedelta(hours=1),
                "expires_at": now + timedelta(hours=23),
                "logs": []
            },
            {
                "visitor_name": "Devendra Patel",
                "vehicle_number": "MH14DX5842",
                "purpose": "Carpentry & Interior Work",
                "resident_id": anand.id,
                "status": PassStatus.in_campus,
                "created_at": now - timedelta(hours=4),
                "expires_at": now + timedelta(hours=20),
                "logs": [
                    {"action": LogAction.entry, "scanned_by": guard2.id, "time": now - timedelta(hours=2)}
                ]
            },
            {
                "visitor_name": "Rajesh Gupta",
                "vehicle_number": "TS08FM8888",
                "purpose": "Client Consultation (Unattended)",
                "resident_id": varun.id,
                "status": PassStatus.expired,
                "created_at": now - timedelta(hours=26),
                "expires_at": now - timedelta(hours=2),
                "logs": []
            }
        ]

        # Check if passes for today already exist
        today_start = now - timedelta(hours=24)
        existing_today = db.query(VisitorPass).filter(VisitorPass.created_at >= today_start).count()
        if existing_today >= len(sample_passes):
            print(f"ℹ️ Database already has {existing_today} passes for today. Skipping duplicate seeding.")
            return

        for p in sample_passes:
            vp = VisitorPass(
                visitor_name=p["visitor_name"],
                vehicle_number=p["vehicle_number"],
                purpose=p["purpose"],
                resident_id=p["resident_id"],
                status=p["status"],
                created_at=p["created_at"],
                expires_at=p["expires_at"],
                qr_token=str(uuid.uuid4())
            )
            db.add(vp)
            db.commit()
            db.refresh(vp)

            vp.qr_image_path = generate_qr_code_file(vp.qr_token)
            db.commit()
            db.refresh(vp)

            for l in p["logs"]:
                log = AccessLog(
                    visitor_pass_id=vp.id,
                    scanned_by=l["scanned_by"],
                    action=l["action"],
                    timestamp=l["time"]
                )
                db.add(log)
            db.commit()
            print(f"✅ Added Pass #{vp.id}: {vp.visitor_name} ({vp.vehicle_number}) -> {vp.status.value}")

        print("🎉 Database successfully seeded with representative dummy passes, logs, and QR codes!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
