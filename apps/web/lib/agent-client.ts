import { HttpAgent } from "@ag-ui/client";

/**
 * Build an HttpAgent that targets the Python agent-server's /agent/run endpoint.
 *
 * The agent holds its own messages + state internally. Callers:
 *   1. refresh the Authorization header from a fresh session before each turn
 *      (tokens expire hourly; mutating agent.headers avoids reconstructing the agent)
 *   2. add the user turn via agent.addMessage(...)
 *   3. invoke agent.runAgent({ runId }, subscriber)
 */
export function createAgentClient({ threadId }: { threadId: string }): HttpAgent {
    const baseUrl = process.env.NEXT_PUBLIC_AGENT_SERVER_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_AGENT_SERVER_URL is not set");
    }

    return new HttpAgent({
        url: `${baseUrl.replace(/\/$/, "")}/agent/run`,
        headers: {},
        threadId,
    });
}

/** Update the Authorization header on an existing HttpAgent. */
export function setAgentAuth(agent: HttpAgent, accessToken: string): void {
    agent.headers = {
        ...agent.headers,
        Authorization: `Bearer ${accessToken}`,
    };
}
