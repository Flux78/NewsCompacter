import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        api_key = os.environ.get("NC_API_KEY", "")
        if not api_key:
            return await call_next(request)

        if request.url.path.startswith("/api/"):
            auth = request.headers.get("Authorization", "")
            expected = f"Bearer {api_key}"
            if auth != expected:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)

        return await call_next(request)
