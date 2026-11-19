import secrets
from fastapi import Request, Response, HTTPException, APIRouter
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Public endpoints and hardware clients exempt from CSRF
        path = request.url.path.rstrip("/")
        exempt_prefixes = (
            "/api/auth/login",
            "/api/auth/signup",
            "/api/csrf-token",
            "/api/anpr/detect-frame",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/qr_codes",
            "/tests",
        )
        if any(request.url.path.startswith(p) or path == p or path.startswith(p) for p in exempt_prefixes):
            return await call_next(request)

        # 2. If the request has an X-API-Key or Authorization Bearer header, skip CSRF
        if "X-API-Key" in request.headers or "Authorization" in request.headers:
            return await call_next(request)

        # 3. Only protect mutating methods
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            cookie_token = request.cookies.get("XSRF-TOKEN")
            header_token = request.headers.get("X-XSRF-TOKEN")

            token = header_token or cookie_token
            if not token:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF token missing or invalid"}
                )
            if cookie_token and header_token and cookie_token != header_token:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF token missing or invalid"}
                )

        response = await call_next(request)
        return response

router = APIRouter()

@router.get("/api/csrf-token")
async def get_csrf_token(response: Response):
    """Provide a CSRF token for the frontend to use."""
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key="XSRF-TOKEN",
        value=token,
        httponly=False,  # Must be readable by frontend JS
        samesite="lax",
        secure=False,  # Set to True in production (HTTPS)
        max_age=3600 * 24
    )
    return {"csrf_token": token, "message": "CSRF cookie set"}
