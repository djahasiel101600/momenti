"""JSON parser mirroring server/api.mjs `readJsonBody`:

- empty body                       -> {}
- body > MOMENTI_MAX_BODY_BYTES    -> 413 {"error": "Request body too large"}
- malformed JSON                   -> 400 {"error": "Invalid JSON body"}

Reading the stream in chunks (instead of touching request.body) keeps the
30 MB cap enforced without Django's global DATA_UPLOAD_MAX_MEMORY_SIZE.
"""
import json

from django.conf import settings
from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser

from .errors import MomentiError


class MomentiJSONParser(JSONParser):
    # Node's readJsonBody ignores the Content-Type header and always tries
    # JSON.parse; media_type "*/*" reproduces that (any content type selects
    # this parser, and non-JSON bodies fail with 400 Invalid JSON body).
    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        max_bytes = settings.MOMENTI_MAX_BODY_BYTES
        chunks = []
        total = 0
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise MomentiError("Request body too large", 413)
            chunks.append(chunk)
        if not chunks:
            return {}
        try:
            return json.loads(b"".join(chunks).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ParseError("Invalid JSON body")
