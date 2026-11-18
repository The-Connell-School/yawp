/**
 * A stand-in for the Anthropic Messages API, for recording the booth video.
 *
 * The app runs unmodified with ANTHROPIC_BASE_URL pointed here. Each request is
 * matched against the storyboard's scripted replies (see replies.mjs) and
 * answered in the real wire format, streamed or not, as text or tool_use. Every
 * request is appended to a JSONL log so an unscripted call is easy to spot.
 *
 *   node fake-anthropic.mjs --port 5199 --log /path/requests.jsonl
 *
 * Never point a deployed environment here: it exists only for local recording.
 */
import http from 'node:http';
import fs from 'node:fs';
import { pickReply } from './replies.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const port = Number(args.port ?? 5199);
const logPath = args.log;
// Streamed text arrives in small chunks at roughly reading speed, so a reply
// visibly types itself out on screen the way it does in production.
const chunkDelayMs = Number(args['chunk-delay'] ?? 28);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let counter = 0;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => (b.type === 'text' ? b.text : b.type === 'tool_result' ? textOf(b.content) : ''))
    .join('\n');
}

export function describeRequest(body) {
  const system = Array.isArray(body.system) ? textOf(body.system) : String(body.system ?? '');
  const messages = body.messages ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return {
    model: body.model,
    system,
    lastUser: lastUser ? textOf(lastUser.content) : '',
    transcript: messages.map((m) => `${m.role}: ${textOf(m.content)}`).join('\n'),
    tools: (body.tools ?? []).map((t) => t.name),
    toolChoice: body.tool_choice,
    turn: messages.filter((m) => m.role === 'user').length,
    lastMessageIsToolResult:
      Array.isArray(lastUser?.content) && lastUser.content.some((b) => b.type === 'tool_result'),
  };
}

/** Normalises a scripted reply into content blocks. */
function toBlocks(reply) {
  if (typeof reply === 'string') return [{ type: 'text', text: reply }];
  if (Array.isArray(reply)) return reply;
  if (reply.tool) {
    return [
      ...(reply.text ? [{ type: 'text', text: reply.text }] : []),
      { type: 'tool_use', id: `toolu_booth_${++counter}`, name: reply.tool, input: reply.input ?? {} },
    ];
  }
  return [{ type: 'text', text: String(reply.text ?? '') }];
}

function chunks(text) {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

async function streamReply(res, body, blocks) {
  const id = `msg_booth_${++counter}`;
  const stopReason = blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  send('message_start', {
    message: {
      id, type: 'message', role: 'assistant', model: body.model, content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 },
    },
  });
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'text') {
      send('content_block_start', { index, content_block: { type: 'text', text: '' } });
      // Group words so long replies don't take forever on screen.
      const words = chunks(block.text);
      for (let i = 0; i < words.length; i += 2) {
        send('content_block_delta', { index, delta: { type: 'text_delta', text: words.slice(i, i + 2).join('') } });
        await sleep(chunkDelayMs);
      }
    } else {
      send('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      const json = JSON.stringify(block.input);
      for (let i = 0; i < json.length; i += 400) {
        send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 400) } });
        await sleep(4);
      }
    }
    send('content_block_stop', { index });
  }
  send('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 400 } });
  send('message_stop', {});
  res.end();
}

function plainReply(res, body, blocks) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    id: `msg_booth_${++counter}`, type: 'message', role: 'assistant', model: body.model,
    content: blocks,
    stop_reason: blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 400 },
  }));
}

const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname.endsWith('/messages/count_tokens')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ input_tokens: 1200 }));
  }
  if (req.method !== 'POST' || !url.pathname.endsWith('/messages')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: url.pathname } }));
  }
  const body = JSON.parse(raw || '{}');
  const request = describeRequest(body);
  let reply;
  let rule;
  try {
    ({ reply, rule } = await pickReply(request, body));
  } catch (error) {
    ({ reply, rule } = { reply: `[UNSCRIPTED: ${error.message}]`, rule: 'error' });
  }
  if (logPath) {
    fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), rule, stream: !!body.stream, request: body }) + '\n');
  }
  console.log(`[fake-anthropic] ${rule} model=${body.model} stream=${!!body.stream} tools=${request.tools.join(',')}`);
  const blocks = toBlocks(reply);
  if (body.stream) await streamReply(res, body, blocks);
  else plainReply(res, body, blocks);
});

server.listen(port, '127.0.0.1', () => console.log(`[fake-anthropic] listening on http://127.0.0.1:${port}`));
