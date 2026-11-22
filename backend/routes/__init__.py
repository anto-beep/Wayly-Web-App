"""Wayly, sub-route modules.

This package incrementally extracts route handlers out of the monolithic
server.py file. Each module exposes an APIRouter and an init function that
receives late-bound dependencies (db handle, auth helper, etc.) from the
server.py boot sequence.
"""
