import os
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent

SYSTEM_PROMPT = ""

# Load the environment variables
load_dotenv()

# Check if the environment variables are set and assign
llm_base_url: Optional[str] = os.getenv("LLM_BASE_URL")
llm_model: Optional[str] = os.getenv("LLM_MODEL")
openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")

if not llm_base_url or not llm_model or not openai_api_key:
    raise ValueError("LLM_BASE_URL, LLM_MODEL, and OPENAI_API_KEY must be set")

# Setup the connection to our local LLM
llm: ChatOpenAI = ChatOpenAI(
    base_url=llm_base_url,
    model=llm_model,
)

# Create the LangGraph agent with tools
agent_executor = create_agent(
    model=llm,
    tools=[],
    system_prompt=SYSTEM_PROMPT
)

# Execute the agent with the input
result = agent_executor.invoke({"messages": [HumanMessage(
    content="")]})

# Print the result
# NOTE: LangGraph returns the last message in the conversation
print(result)