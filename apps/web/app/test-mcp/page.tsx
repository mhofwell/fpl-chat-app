'use client';

import { useState } from 'react';
import { initializeMcpSession, callMcpTool } from '@/app/actions/mcp';

export default function TestMcpPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [echoResult, setEchoResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeClient = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await initializeMcpSession();
      if (!id) {
        throw new Error('Failed to initialize MCP session');
      }
      setSessionId(id);
      
      // List available tools - TODO: implement listMcpTools
      // const toolsResult = await listMcpTools(id);
      // if (toolsResult.success && toolsResult.tools) {
      //   setTools(toolsResult.tools);
      // }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize');
    } finally {
      setLoading(false);
    }
  };

  const testEchoTool = async () => {
    if (!sessionId) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await callMcpTool('echo', { message: 'Hello from Next.js!' }, sessionId);
      if (result.success) {
        setEchoResult(JSON.stringify(result.result, null, 2));
      } else {
        setError(result.error || 'Failed to call tool');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to call tool');
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    // For now, just clear the session
    setSessionId(null);
    setTools([]);
    setEchoResult('');
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">MCP Client-Server Test</h1>
      
      <div className="space-y-6">
        {/* Connection Status */}
        <div className="bg-background border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
          <p className="text-sm text-muted-foreground">
            Session ID: {sessionId || 'Not connected'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          {!sessionId ? (
            <button
              onClick={initializeClient}
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect to MCP Server'}
            </button>
          ) : (
            <>
              <button
                onClick={testEchoTool}
                disabled={loading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Test Echo Tool
              </button>
              <button
                onClick={disconnect}
                disabled={loading}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Available Tools */}
        {tools.length > 0 && (
          <div className="bg-background border rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-2">Available Tools</h2>
            <ul className="space-y-2">
              {tools.map((tool, index) => (
                <li key={index} className="text-sm">
                  <span className="font-mono font-semibold">{tool.name}</span>
                  {tool.description && (
                    <span className="text-muted-foreground"> - {tool.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Echo Result */}
        {echoResult && (
          <div className="bg-background border rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-2">Echo Tool Result</h2>
            <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
              {echoResult}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}