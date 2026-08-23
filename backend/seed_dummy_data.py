import sys
import os
from datetime import datetime, timedelta

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import User, VisitorPass, AccessLog, UserRole, PassStatus, LogAction
from auth import hash_password

def seed_data():
    print("🌱 Re-creating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        print("👥 Seeding Users...")
        # 1. Admin
        admin = User(
            username="admin",
            email="admin@vvas.local",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator",
            role=UserRole.admin,
        )

        # 2. Residents
        varun = User(
            username="varun",
            email="varun@test.com",
            hashed_password=hash_password("pass123"),
            full_name="Varun M",
            role=UserRole.resident,
            flat_number="A-101",
        )
        priya = User(
            username="priya",
            email="priya@test.com",
            hashed_password=hash_password("pass123"),
            full_name="Priya Sharma",
            role=UserRole.resident,
            flat_number="B-204",
        )
        anand = User(
            username="anand",
            email="anand@test.com",
            hashed_password=hash_password("pass123"),
            full_name="Anand Mehta",
            role=UserRole.resident,
            flat_number="C-302",
        )

        # 3. Guards
        guard1 = User(
            username="guard1",
            email="guard1@test.com",
            hashed_password=hash_password("pass123"),
            full_name="Security Ram",
            role=UserRole.guard,
        )
        guard2 = User(
            username="guard2",
            email="guard2@test.com",
            hashed_password=hash_password("pass123"),
            full_name="Security Shyam",
            role=UserRole.guard,
        )

        db.add_all([admin, varun, priya, anand, guard1, guard2])
        db.commit()

        print("🎫 Seeding Visitor Passes & Access Logs...")
        now = datetime.utcnow()

        # Pass 1: DL2CAY3180 — In Campus
        pass1 = VisitorPass(
            visitor_name="Anil Kumar",
            vehicle_number="DL2CAY3180",
            purpose="Amazon Delivery",
            resident_id=priya.id,
            status=PassStatus.in_campus,
            created_at=now - timedelta(hours=2),
            expires_at=now + timedelta(hours=22),
        )
        db.add(pass1)
        db.commit()

        log1_entry = AccessLog(
            visitor_pass_id=pass1.id,
            scanned_by=guard1.id,
            action=LogAction.entry,
            timestamp=now - timedelta(minutes=45),
        )
        db.add(log1_entry)

        # Pass 2: MH12JC2813 — Exited Campus
        pass2 = VisitorPass(
            visitor_name="Suresh Patel",
            vehicle_number="MH12JC2813",
            purpose="Guest Visit",
            resident_id=varun.id,
            status=PassStatus.exited,
            created_at=now - timedelta(hours=4),
            expires_at=now + timedelta(hours=20),
        )
        db.add(pass2)
        db.commit()

        log2_entry = AccessLog(
            visitor_pass_id=pass2.id,
            scanned_by=guard1.id,
            action=LogAction.entry,
            timestamp=now - timedelta(hours=3, minutes=30),
        )
        log2_exit = AccessLog(
            visitor_pass_id=pass2.id,
            scanned_by=guard2.id,
            action=LogAction.exit,
            timestamp=now - timedelta(minutes=15),
        )
        db.add_all([log2_entry, log2_exit])

        # Pass 3: TS08FM8888 — Pass Created (Not Inside)
        pass3 = VisitorPass(
            visitor_name="Kiran Rao",
            vehicle_number="TS08FM8888",
            purpose="Plumber / Maintenance",
            resident_id=anand.id,
            status=PassStatus.not_inside,
            created_at=now - timedelta(hours=1),
            expires_at=now + timedelta(hours=23),
        )

        # Pass 4: MH14DX5842 — In Campus
        pass4 = VisitorPass(
            visitor_name="Rahul Verma",
            vehicle_number="MH14DX5842",
            purpose="Uber / Cab Drop",
            resident_id=varun.id,
            status=PassStatus.in_campus,
            created_at=now - timedelta(minutes=30),
            expires_at=now + timedelta(hours=23, minutes=30),
        )
        db.add_all([pass3, pass4])
        db.commit()

        log4_entry = AccessLog(
            visitor_pass_id=pass4.id,
            scanned_by=guard1.id,
            action=LogAction.entry,
            timestamp=now - timedelta(minutes=10),
        )
        db.add(log4_entry)

        # Pass 5: KA01AB1234 — Exited Campus
        pass5 = VisitorPass(
            visitor_name="Vikram Malhotra",
            vehicle_number="KA01AB1234",
            purpose="Family Dinner",
            resident_id=priya.id,
            status=PassStatus.exited,
            created_at=now - timedelta(hours=6),
            expires_at=now + timedelta(hours=18),
        )
        db.add(pass5)
        db.commit()

        log5_entry = AccessLog(
            visitor_pass_id=pass5.id,
            scanned_by=guard2.id,
            action=LogAction.entry,
            timestamp=now - timedelta(hours=5),
        )
        log5_exit = AccessLog(
            visitor_pass_id=pass5.id,
            scanned_by=guard1.id,
            action=LogAction.exit,
            timestamp=now - timedelta(hours=1),
        )
        db.add_all([log5_entry, log5_exit])

        db.commit()
        print("✅ Database successfully seeded with realistic dummy entries!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
