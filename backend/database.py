import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging
from config import DATABASE_URL

logger = logging.getLogger(__name__)

# Default to MongoDB in production/Vercel, and SQLite for local development (unless overridden)
is_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
USE_MONGODB = os.getenv("USE_MONGODB", "true" if is_vercel else "false").lower() in ("true", "1", "yes")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request (MongoDB or SQLite)."""
    if USE_MONGODB:
        use_mongo = False
        try:
            from mongo_adapter import MongoSession
            session = MongoSession()
            use_mongo = True
        except Exception as e:
            logger.warning(f"MongoDB session unavailable ({e}), falling back to SQLite.")
            use_mongo = False

        if use_mongo:
            try:
                yield session
            finally:
                session.close()
            return

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
