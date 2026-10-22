#!/usr/bin/env python3
"""
Migrate existing SQLite (app.db) data to MongoDB Atlas.
"""

import os
import sys
import sqlite3
import base64
from datetime import datetime
from pymongo import MongoClient

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQLITE_DB_PATH = os.path.join(BASE_DIR, "backend", "app.db")
QR_CODES_DIR = os.path.join(BASE_DIR, "backend", "qr_codes")

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb+srv://amritacce28_db_user:pG6fQZE96E6vfAEp@cluster0.zbabbp9.mongodb.net/?retryWrites=true&w=majority"
)

def get_qr_data_uri(qr_token, old_path):
    """Convert PNG to Base64 Data URI so it works on serverless without local disk."""
    if not qr_token:
        return old_path
    png_path = os.path.join(QR_CODES_DIR, f"qr_{qr_token}.png")
    if os.path.exists(png_path):
        with open(png_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{b64}"
    # Generate on the fly if file missing
    try:
        import qrcode
        import io
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(qr_token)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64}"
    except Exception:
        return old_path

def migrate():
    print("=" * 60)
    print("MIGRATING SQLITE -> MONGODB ATLAS")
    print("=" * 60)
    print(f"Connecting to MongoDB Atlas...")
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
    db = client["visitor_access_db"]
    print("Connected successfully!")

    con = sqlite3.connect(SQLITE_DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # 1. Migrate Users
    users_rows = cur.execute("SELECT * FROM users").fetchall()
    print(f"\nFound {len(users_rows)} users in SQLite.")
    users_col = db["users"]
    users_col.create_index("username", unique=True)
    users_col.create_index("id", unique=True)
    users_migrated = 0
    for u in users_rows:
        doc = dict(u)
        # Parse datetime if string
        if isinstance(doc.get("created_at"), str):
            try:
                doc["created_at"] = datetime.fromisoformat(doc["created_at"])
            except Exception:
                pass
        doc["is_approved"] = bool(doc.get("is_approved", 1))
        # Upsert by id
        users_col.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        users_migrated += 1
    print(f"✅ Users migrated/synced: {users_migrated}")

    # 2. Migrate Visitor Passes
    passes_rows = cur.execute("SELECT * FROM visitor_passes").fetchall()
    print(f"\nFound {len(passes_rows)} visitor passes in SQLite.")
    passes_col = db["visitor_passes"]
    passes_col.create_index("qr_token", unique=True)
    passes_col.create_index("id", unique=True)
    passes_migrated = 0
    for p in passes_rows:
        doc = dict(p)
        # Convert QR to data URI
        token = doc.get("qr_token")
        old_path = doc.get("qr_image_path")
        doc["qr_image_path"] = get_qr_data_uri(token, old_path)

        for dt_field in ["created_at", "expires_at"]:
            if isinstance(doc.get(dt_field), str):
                try:
                    doc[dt_field] = datetime.fromisoformat(doc[dt_field])
                except Exception:
                    pass
        passes_col.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        passes_migrated += 1
    print(f"✅ Visitor passes migrated/synced: {passes_migrated}")

    # 3. Migrate Access Logs
    logs_rows = cur.execute("SELECT * FROM access_logs").fetchall()
    print(f"\nFound {len(logs_rows)} access logs in SQLite.")
    logs_col = db["access_logs"]
    logs_col.create_index("id", unique=True)
    logs_migrated = 0
    for l in logs_rows:
        doc = dict(l)
        if isinstance(doc.get("timestamp"), str):
            try:
                doc["timestamp"] = datetime.fromisoformat(doc["timestamp"])
            except Exception:
                pass
        logs_col.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        logs_migrated += 1
    print(f"✅ Access logs migrated/synced: {logs_migrated}")

    # 4. Migrate Hardware API Keys
    keys_rows = cur.execute("SELECT * FROM hardware_api_keys").fetchall()
    print(f"\nFound {len(keys_rows)} hardware API keys in SQLite.")
    keys_col = db["hardware_api_keys"]
    keys_col.create_index("id", unique=True)
    keys_migrated = 0
    for k in keys_rows:
        doc = dict(k)
        doc["is_active"] = bool(doc.get("is_active", 1))
        if isinstance(doc.get("created_at"), str):
            try:
                doc["created_at"] = datetime.fromisoformat(doc["created_at"])
            except Exception:
                pass
        keys_col.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        keys_migrated += 1
    print(f"✅ Hardware API keys migrated/synced: {keys_migrated}")

    con.close()
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE! ALL DATA SUCCESSFULLY SYNCED TO MONGODB ATLAS.")
    print("=" * 60)

if __name__ == "__main__":
    migrate()
