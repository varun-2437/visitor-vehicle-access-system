"""
MongoDB Atlas Adapter for Visitor Vehicle Access System.
Provides a drop-in SQLAlchemy-compatible Session and Query interface over MongoDB Atlas.
"""

import os
import re
from datetime import datetime
from pymongo import MongoClient
import sqlalchemy

# Determine MongoDB URI from environment or credentials file
MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    # Check atlas-credentials.env
    creds_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "atlas-credentials.env")
    if os.path.exists(creds_path):
        with open(creds_path, "r") as f:
            for line in f:
                if line.startswith("MONGODB_URI="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    MONGODB_URI = val
                    break

# Fallback default from Atlas
if not MONGODB_URI:
    MONGODB_URI = "mongodb+srv://amritacce28_db_user:pG6fQZE96E6vfAEp@cluster0.zbabbp9.mongodb.net/?retryWrites=true&w=majority"

# Singleton Client & DB
_client = None
_db = None

def get_mongo_db():
    global _client, _db
    if _db is None:
        tls_kwargs = {}
        try:
            import certifi
            tls_kwargs["tlsCAFile"] = certifi.where()
        except Exception:
            pass
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000, **tls_kwargs)
        _client.admin.command("ping")
        _db = _client["visitor_access_db"]
    return _db

MODEL_COLLECTION_MAP = {
    "User": "users",
    "VisitorPass": "visitor_passes",
    "AccessLog": "access_logs",
    "HardwareAPIKey": "hardware_api_keys",
}


def _doc_to_model(model_cls, doc, session=None):
    if not doc:
        return None
    d = dict(doc)
    d.pop("_id", None)
    cols = {c.key for c in model_cls.__table__.columns}
    filtered = {k: v for k, v in d.items() if k in cols}
    obj = model_cls(**filtered)
    obj._mongo_id = doc.get("_id")
    obj._mongo_orig = d.copy()
    obj._mongo_session = session

    # Attach relationship loaders
    if model_cls.__name__ == "VisitorPass":
        # resident relationship
        res_id = d.get("resident_id")
        if res_id and session:
            from models import User
            obj.resident = session.query(User).filter(User.id == res_id).first()
    elif model_cls.__name__ == "AccessLog":
        # visitor_pass & guard relationships
        vp_id = d.get("visitor_pass_id")
        guard_id = d.get("scanned_by")
        if session:
            from models import VisitorPass, User
            if vp_id:
                obj.visitor_pass = session.query(VisitorPass).filter(VisitorPass.id == vp_id).first()
            if guard_id:
                obj.guard = session.query(User).filter(User.id == guard_id).first()

    return obj


class MongoQuery:
    def __init__(self, model_cls, session):
        self.model_cls = model_cls
        self.session = session
        col_name = MODEL_COLLECTION_MAP.get(model_cls.__name__, model_cls.__tablename__)
        self.collection = session.mongo_db[col_name]
        self.filters = {}
        self.sort_fields = []
        self._limit_val = None

    def filter(self, *criteria):
        for crit in criteria:
            self._parse_criterion(crit)
        return self

    def _parse_criterion(self, crit):
        # Handle binary expressions (e.g. User.username == 'admin')
        if hasattr(crit, "left") and hasattr(crit, "right"):
            left = crit.left
            right_val = crit.right.value if hasattr(crit.right, "value") else crit.right
            op_name = crit.operator.__name__ if hasattr(crit.operator, "__name__") else str(crit.operator)

            # Check if left is func.lower(Column)
            is_lower = False
            col_name = None
            if hasattr(left, "name"):
                col_name = left.name
            elif str(type(left)).find("Function") != -1 or hasattr(left, "clauses"):
                is_lower = True
                # Extract inner column name
                for clause in getattr(left, "clauses", []):
                    if hasattr(clause, "name"):
                        col_name = clause.name
                        break
                if not col_name:
                    col_name = str(left).replace("lower(", "").replace(")", "").split(".")[-1]
            else:
                col_name = str(left).split(".")[-1]

            if col_name:
                if op_name in ("eq", "__eq__"):
                    if is_lower and isinstance(right_val, str):
                        self.filters[col_name] = {"$regex": f"^{re.escape(right_val)}$", "$options": "i"}
                    else:
                        self.filters[col_name] = right_val
                elif op_name in ("ge", "__ge__"):
                    self.filters.setdefault(col_name, {})["$gte"] = right_val
                elif op_name in ("le", "__le__"):
                    self.filters.setdefault(col_name, {})["$lte"] = right_val
                elif op_name in ("gt", "__gt__"):
                    self.filters.setdefault(col_name, {})["$gt"] = right_val
                elif op_name in ("lt", "__lt__"):
                    self.filters.setdefault(col_name, {})["$lt"] = right_val
                elif op_name in ("ne", "__ne__"):
                    self.filters[col_name] = {"$ne": right_val}
                elif op_name in ("in_op", "in_"):
                    self.filters[col_name] = {"$in": list(right_val)}

    def order_by(self, *clauses):
        for clause in clauses:
            if hasattr(clause, "element") and hasattr(clause, "modifier"):
                field_name = clause.element.name
                descending = clause.modifier == sqlalchemy.sql.operators.desc_op
                self.sort_fields.append((field_name, -1 if descending else 1))
            elif hasattr(clause, "name"):
                self.sort_fields.append((clause.name, 1))
            elif hasattr(clause, "desc"):
                # Handle direct Column.desc()
                self.sort_fields.append((str(clause).split()[0].split(".")[-1], -1))
        return self

    def limit(self, val):
        self._limit_val = val
        return self

    def first(self):
        cursor = self.collection.find(self.filters)
        if self.sort_fields:
            cursor = cursor.sort(self.sort_fields)
        doc = cursor.limit(1)
        docs = list(doc)
        if docs:
            return _doc_to_model(self.model_cls, docs[0], self.session)
        return None

    def all(self):
        cursor = self.collection.find(self.filters)
        if self.sort_fields:
            cursor = cursor.sort(self.sort_fields)
        if self._limit_val:
            cursor = cursor.limit(self._limit_val)
        return [_doc_to_model(self.model_cls, d, self.session) for d in cursor]


class MongoSession:
    def __init__(self, db=None):
        self.mongo_db = db or get_mongo_db()
        self._new_objects = []
        self._deleted_objects = []
        self._tracked_objects = []

    def query(self, model_cls):
        return MongoQuery(model_cls, self)

    def add(self, obj):
        if obj not in self._new_objects and not hasattr(obj, "_mongo_id"):
            self._new_objects.append(obj)

    def delete(self, obj):
        if obj not in self._deleted_objects:
            self._deleted_objects.append(obj)

    def commit(self):
        # 1. Process Insertions
        for obj in self._new_objects:
            col_name = MODEL_COLLECTION_MAP.get(obj.__class__.__name__, obj.__tablename__)
            col = self.mongo_db[col_name]

            # Generate numeric ID if not present
            if not getattr(obj, "id", None):
                last_doc = col.find_one(sort=[("id", -1)])
                next_id = (last_doc["id"] + 1) if (last_doc and "id" in last_doc) else 1
                obj.id = next_id

            doc = {}
            for c in obj.__class__.__table__.columns:
                val = getattr(obj, c.key, None)
                if hasattr(val, "value"):  # Enum
                    val = val.value
                doc[c.key] = val

            res = col.insert_one(doc)
            obj._mongo_id = res.inserted_id
            obj._mongo_orig = doc.copy()
            self._tracked_objects.append(obj)
        self._new_objects.clear()

        # 2. Process Deletions
        for obj in self._deleted_objects:
            col_name = MODEL_COLLECTION_MAP.get(obj.__class__.__name__, obj.__tablename__)
            col = self.mongo_db[col_name]
            if getattr(obj, "id", None):
                col.delete_one({"id": obj.id})
        self._deleted_objects.clear()

        # 3. Process Updates on Tracked Objects
        for obj in self._tracked_objects:
            if hasattr(obj, "_mongo_orig") and getattr(obj, "id", None):
                col_name = MODEL_COLLECTION_MAP.get(obj.__class__.__name__, obj.__tablename__)
                col = self.mongo_db[col_name]
                curr_doc = {}
                for c in obj.__class__.__table__.columns:
                    val = getattr(obj, c.key, None)
                    if hasattr(val, "value"):
                        val = val.value
                    curr_doc[c.key] = val
                col.update_one({"id": obj.id}, {"$set": curr_doc})
                obj._mongo_orig = curr_doc.copy()

    def refresh(self, obj):
        if getattr(obj, "id", None):
            col_name = MODEL_COLLECTION_MAP.get(obj.__class__.__name__, obj.__tablename__)
            col = self.mongo_db[col_name]
            doc = col.find_one({"id": obj.id})
            if doc:
                for c in obj.__class__.__table__.columns:
                    if c.key in doc:
                        setattr(obj, c.key, doc[c.key])

    def close(self):
        self._new_objects.clear()
        self._deleted_objects.clear()
        self._tracked_objects.clear()
