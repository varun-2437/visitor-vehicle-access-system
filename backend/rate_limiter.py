import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

class RateLimiter:
    """
    In-memory IP rate limiter to prevent brute-force login attempts and API abuse.
    """
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.attempts = defaultdict(list)

    def check_rate_limit(self, request: Request):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()

        # Remove attempts older than window_seconds
        self.attempts[client_ip] = [
            t for t in self.attempts[client_ip] if now - t < self.window_seconds
        ]

        if len(self.attempts[client_ip]) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - self.attempts[client_ip][0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many login attempts. Rate limit exceeded ({self.max_requests} attempts/min). Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        self.attempts[client_ip].append(now)

# Global rate limiter instances
login_rate_limiter = RateLimiter(max_requests=5, window_seconds=60)
signup_rate_limiter = RateLimiter(max_requests=10, window_seconds=60)
