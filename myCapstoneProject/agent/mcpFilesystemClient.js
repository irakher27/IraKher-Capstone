/**
 * mcpFilesystemClient.js
 * -----------------------
 * Thin wrapper around the @modelcontextprotocol/server-filesystem MCP
 * server. Spawns the server as a stdio subprocess, scoped to a single
 * allowed directory, and exposes the handful of tool calls the agent
 * loop needs (list/read/write) as plain async functions.
 */

const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const SERVER_ENTRY = require.resolve(
  "@modelcontextprotocol/server-filesystem/dist/index.js"
);

function createFilesystemClient(allowedDir) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, allowedDir],
  });

  const client = new Client({ name: "movie-night-agent", version: "1.0.0" });
  let connected = null;

  async function ensureConnected() {
    if (!connected) {
      connected = client.connect(transport);
    }
    return connected;
  }

  async function listJsonFiles(dirPath) {
    await ensureConnected();
    const result = await client.callTool({
      name: "list_directory",
      arguments: { path: dirPath },
    });
    const text = result.content[0].text;
    return text
      .split("\n")
      .filter((line) => line.startsWith("[FILE]"))
      .map((line) => line.replace("[FILE]", "").trim())
      .filter((name) => name.endsWith(".json"));
  }

  async function readTextFile(filePath) {
    await ensureConnected();
    const result = await client.callTool({
      name: "read_text_file",
      arguments: { path: filePath },
    });
    return result.content[0].text;
  }

  async function writeFile(filePath, content) {
    await ensureConnected();
    await client.callTool({
      name: "write_file",
      arguments: { path: filePath, content },
    });
  }

  async function close() {
    if (connected) {
      await client.close();
    }
  }

  return { listJsonFiles, readTextFile, writeFile, close };
}

module.exports = { createFilesystemClient };
