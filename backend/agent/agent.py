import asyncio
import logging
import os
import sys

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.agents.middleware import (
    ContextEditingMiddleware,
    SummarizationMiddleware,
    ToolRetryMiddleware,
)
from langchain.agents.middleware.context_editing import ClearToolUsesEdit
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from agent.prompts.system import SYSTEM_PROMPT
from agent.tools.form_amount_regression import form_amount_regression
from agent.tools.quote_adjustment import quote_adjustment

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# Load the environment variables
load_dotenv()

# Check if the environment variables are set and assign
llm_base_url: str | None = os.getenv("LLM_BASE_URL")
llm_model: str | None = os.getenv("LLM_MODEL")
openai_api_key: str | None = os.getenv("OPENAI_API_KEY")

if not llm_base_url or not llm_model or not openai_api_key:
    raise ValueError("LLM_BASE_URL, LLM_MODEL, and OPENAI_API_KEY must be set")

# Setup the connection to our local LLM
llm: ChatOpenAI = ChatOpenAI(
    base_url=llm_base_url,
    model=llm_model,
)

# Build tools: local RAG search + any MCP servers defined in mcp/config.json
agent_tools = [form_amount_regression, quote_adjustment]


agent_executor = create_agent(
    model=llm,
    tools=agent_tools,
    system_prompt=SYSTEM_PROMPT,
    middleware=[
        # Return tool errors to model instead of crashing (e.g. MCP "command failed")
        ToolRetryMiddleware(max_retries=0, on_failure="continue"),
        # Truncate individual tool outputs (MCP can return 80K+ tokens in one message) (would need to implement ourselves)
        # TruncateToolOutputMiddleware(max_chars=12_000),
        # Clear old tool outputs when approaching context limit
        ContextEditingMiddleware(
            edits=[
                ClearToolUsesEdit(trigger=20_000, keep=2),
            ],
        ),
        # Summarize conversation when approaching 32K context limit (model max)
        SummarizationMiddleware(
            model=llm,
            trigger=("tokens", 25_000),
            keep=("messages", 10),
        ),
    ],
)


async def _run_agent(user_message: str):
    """Execute the agent asynchronously (required for MCP tools)."""
    return await agent_executor.ainvoke(
        {
            "messages": [
                HumanMessage(content=user_message),
            ]
        }
    )


def main() -> None:
    """Run the SAS enclosure analysis agent from a CLI prompt."""
    if len(sys.argv) < 2:
        raise SystemExit('Usage: python agent.py "<question or instruction>"')

    user_message = " ".join(sys.argv[1:])

    # Execute the agent with the input (async for MCP tool support)
    result = asyncio.run(_run_agent(user_message))

    # Generate and print human-readable report
    messages = result.get("messages", [])
    for message in messages:
        print(message.content)


if __name__ == "__main__":
    main()
