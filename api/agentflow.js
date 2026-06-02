export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const baseUrl = process.env.AGENTFLOW_API_BASE_URL || process.env.VITE_AGENTFLOW_API_BASE_URL;
    const apiKey = process.env.AGENTFLOW_API_KEY || process.env.VITE_AGENTFLOW_API_KEY;
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';

    if (!baseUrl || !apiKey) {
      res.status(500).json({ error: 'Agentflow environment variables are not configured' });
      return;
    }

    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const sessionResponse = await fetch(`${baseUrl}/chat/create_session`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_name: `Fund monitoring - ${new Date().toISOString()}`,
      }),
    });

    if (!sessionResponse.ok) {
      const detail = await sessionResponse.text();
      res.status(sessionResponse.status).json({
        error: 'Failed to create Agentflow session',
        detail,
      });
      return;
    }

    const sessionJson = await sessionResponse.json();
    const sessionId = sessionJson?.data?.session_id;

    if (!sessionId) {
      res.status(502).json({
        error: 'Agentflow session response did not include data.session_id',
        detail: sessionJson,
      });
      return;
    }

    const streamResponse = await fetch(`${baseUrl}/chat/stream_question`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        session_id: sessionId,
      }),
    });

    if (!streamResponse.ok || !streamResponse.body) {
      const detail = await streamResponse.text();
      res.status(streamResponse.status || 502).json({
        error: 'Failed to stream Agentflow response',
        detail,
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`);

    const reader = streamResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Agentflow request failed',
      });
      return;
    }

    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Agentflow stream failed' })}\n\n`);
    res.end();
  }
}
