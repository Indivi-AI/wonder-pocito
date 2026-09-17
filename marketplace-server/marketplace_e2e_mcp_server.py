"""Minimal stdio MCP server for end-to-end testing of the mcp tool_type."""
from fastmcp import FastMCP

server = FastMCP('wonder-e2e-mcp')


@server.tool
def ping(text: str) -> str:
    """Echo back with a pong prefix."""
    return f'pong: {text}'


if __name__ == '__main__':
    server.run()
