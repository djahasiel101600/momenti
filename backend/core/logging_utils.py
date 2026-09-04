"""In-memory ring buffer for the admin log tail.

Attached to the "momenti" logger at runtime (idempotently) instead of via
LOGGING dictConfig, so every gunicorn worker captures lines from boot without
relying on custom-factory dictConfig semantics.
"""
import logging
from collections import deque


class MomentiBufferHandler(logging.Handler):
    """Keeps the last `capacity` formatted log lines in memory."""

    def __init__(self, capacity=500):
        super().__init__()
        self.lines = deque(maxlen=capacity)

    def emit(self, record):
        try:
            self.lines.append(self.format(record))
        except Exception:
            pass  # never let logging break the app


def get_buffer():
    """Return the shared MomentiBufferHandler, attaching one if missing."""
    logger = logging.getLogger("momenti")
    for handler in logger.handlers:
        if isinstance(handler, MomentiBufferHandler):
            return handler
    handler = MomentiBufferHandler()
    handler.setFormatter(logging.Formatter("[momenti] {message}", style="{"))
    logger.addHandler(handler)
    return handler
