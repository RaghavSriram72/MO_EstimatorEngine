import os

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from agent.tools.form_amount_regression import form_amount_regression
from agent.tools.quote_adjustment import quote_adjustment

SYSTEM_PROMPT = ""

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

# Create the LangGraph agent with tools
agent_executor = create_agent(
    model=llm,
    tools=[form_amount_regression, quote_adjustment],
    system_prompt=SYSTEM_PROMPT,
)

# Execute the agent with the input
result = agent_executor.invoke({"messages": [HumanMessage(content="")]})

# Print the result
print(result)
