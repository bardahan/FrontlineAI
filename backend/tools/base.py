from abc import ABC, abstractmethod
from typing import ClassVar


class AgentTool(ABC):
    name: ClassVar[str]

    @classmethod
    @abstractmethod
    def from_config(cls, config: dict) -> "AgentTool":
        """Instantiate from user_tools.config JSON."""
        ...

    @property
    @abstractmethod
    def function_declarations(self) -> list:
        """List of function declaration dicts for Gemini."""
        ...

    @property
    @abstractmethod
    def prompt_contribution(self) -> str:
        """Text appended to system instruction."""
        ...

    def is_available(self) -> bool:
        return True

    @abstractmethod
    async def execute(self, function_name: str, args: dict) -> str:
        """Execute the named function and return a string result."""
        ...
