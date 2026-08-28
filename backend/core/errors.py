"""API exceptions; messages surface as {"error": "<message>"} via the
shared exception handler (wire-compatible with server/api.mjs)."""
from rest_framework.exceptions import APIException


class MomentiError(APIException):
    """Domain error carrying an explicit HTTP status."""

    status_code = 400

    def __init__(self, detail=None, status_code=None):
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=detail)
