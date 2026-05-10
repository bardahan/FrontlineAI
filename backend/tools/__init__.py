import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from database import UserTool as UserToolModel

from tools.base import AgentTool
from tools.calendar import CalendarTool

logger = logging.getLogger("frontline_ai.tools")

TOOL_REGISTRY: dict[str, type[AgentTool]] = {
    "google_calendar": CalendarTool,
}


def build_tools_for_user(user_tools: list) -> list[AgentTool]:
    """Instantiate enabled tools from registry using their stored config."""
    result = []
    for ut in user_tools:
        if not ut.enabled:
            continue
        cls = TOOL_REGISTRY.get(ut.tool_name)
        if cls is None:
            logger.warning("[tools] unknown tool in registry: %s", ut.tool_name)
            continue
        try:
            config = json.loads(ut.config) if ut.config else {}
        except Exception as e:
            logger.error("[tools] failed to parse config for %s: %s", ut.tool_name, e)
            config = {}
        try:
            tool = cls.from_config(config)
            logger.debug("[tools] loaded tool: %s (access_level=%s)", ut.tool_name, getattr(tool, 'access_level', 'n/a'))
            result.append(tool)
        except Exception as e:
            logger.error("[tools] failed to instantiate %s: %s", ut.tool_name, e)
    return result
