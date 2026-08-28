#!/usr/bin/env python
"""Django management entrypoint for the momenti backend."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "momenti.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Create the backend virtualenv and install "
            "requirements first:\n"
            "  python -m venv backend/.venv\n"
            "  backend/.venv/Scripts/python -m pip install -r backend/requirements.txt"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
