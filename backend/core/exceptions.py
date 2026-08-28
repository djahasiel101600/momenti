"""DRF exception handler rendering every error as {"error": "<message>"} —
the shape src/api/client.js reads (data?.error) — instead of DRF's default
{"detail": ...} / per-field dicts."""
from rest_framework.views import exception_handler as drf_exception_handler


def momenti_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict):
        if set(data.keys()) == {"detail"}:
            message = str(data["detail"])
        else:
            parts = []
            for key, value in data.items():
                if isinstance(value, (list, tuple)):
                    value = "; ".join(str(item) for item in value)
                if key == "detail":
                    parts.append(str(value))
                else:
                    parts.append(f"{key}: {value}")
            message = "; ".join(parts)
    elif isinstance(data, (list, tuple)):
        message = "; ".join(str(item) for item in data)
    else:
        message = str(data)
    response.data = {"error": message or "Request failed"}
    return response
