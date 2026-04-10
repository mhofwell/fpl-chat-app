"""Anthropic streaming response -> AG-UI event adapter.

M5: translates Anthropic SDK streaming events to ag-ui-protocol events.
    This is the single module that owns the Anthropic<->AG-UI mapping.
    Target: <=300 lines. See design doc §6 for the full event mapping table.
"""

from __future__ import annotations
