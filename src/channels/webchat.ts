import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { createLogger } from '../logger.ts';
import type { Channel, UnifiedMessage } from '../types/channels.js';
import { wss, startServer } from '../server.ts';
import { toolExecutor } from '../tools/index.ts';
import '../types/websocket.js';

const log = createLogger('webchat');

interface WebChatMessage {
  type: 'message' | 'typing' | 'session_init';
  text?: string;
  sessionId?: string;
  chatId?: string;
  userId?: string;
}

export class WebChatChannel implements Channel {
  public id = 'webchat';
  public preferredFormat: 'markdown' = 'markdown';
  private clients: Set<WebSocket> = new Set();
  private clientsByChatId: Map<string, Set<WebSocket>> = new Map();
  private chatIdByClient: Map<WebSocket, string> = new Map();
  private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;
  private isStarted = false;
  private connectionListener?: ((ws: WebSocket, req?: any) => void) | undefined;

  static create(): WebChatChannel | null {
    return new WebChatChannel();
  }

  private registerClient(ws: WebSocket, chatId: string): void {
    const oldChatId = this.chatIdByClient.get(ws);
    if (oldChatId && oldChatId !== chatId) {
      const oldSet = this.clientsByChatId.get(oldChatId);
      if (oldSet) {
        oldSet.delete(ws);
        if (oldSet.size === 0) {
          this.clientsByChatId.delete(oldChatId);
        }
      }
    }
    this.chatIdByClient.set(ws, chatId);
    let set = this.clientsByChatId.get(chatId);
    if (!set) {
      set = new Set();
      this.clientsByChatId.set(chatId, set);
    }
    set.add(ws);
  }

  private unregisterClient(ws: WebSocket): void {
    this.clients.delete(ws);
    const chatId = this.chatIdByClient.get(ws);
    if (chatId) {
      const set = this.clientsByChatId.get(chatId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          this.clientsByChatId.delete(chatId);
        }
      }
      this.chatIdByClient.delete(ws);
    }
  }

  async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
    this.onMessageCb = onMessage;

    await startServer();

    if (this.isStarted) return;
    this.isStarted = true;

    this.connectionListener = (ws: WebSocket & { auth?: any }, req?: any) => {
      this.handleConnection(ws, req);
    };

    wss.on('connection', this.connectionListener);
  }

  public handleConnection(ws: WebSocket & { auth?: any }, req?: any): void {
    this.clients.add(ws);

    let initialChatId = '';
    if (req?.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        initialChatId =
          parsedUrl.searchParams.get('sessionId') || parsedUrl.searchParams.get('session') || '';
      } catch {
        // ignore url parse error
      }
    }
    if (
      !initialChatId &&
      ws.auth?.sessionId &&
      ws.auth.sessionId !== 'local' &&
      ws.auth.sessionId !== 'api-key-session'
    ) {
      initialChatId = ws.auth.sessionId;
    }
    if (!initialChatId) {
      initialChatId = `web-${crypto.randomUUID()}`;
    }

    this.registerClient(ws, initialChatId);
    log.info(
      `📡 [WebChat] Client connected: session=${initialChatId} (total: ${this.clients.size})`,
    );

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const parsed: WebChatMessage = JSON.parse(data.toString());
        log.debug(`📥 [WebChat] Message received - type: ${parsed.type}`);

        if (parsed.type === 'message' && parsed.text && this.onMessageCb) {
          const requestedChatId = parsed.chatId || parsed.sessionId;
          const currentChatId = this.chatIdByClient.get(ws) || initialChatId;
          if (requestedChatId && requestedChatId !== currentChatId) {
            log.warn(
              `⚠️ [WebChat] Blocked unauthorized session rebinding attempt from ${currentChatId} to ${requestedChatId}`,
            );
            ws.send(
              JSON.stringify({
                type: 'error',
                error:
                  'Cannot switch session on an existing connection. Please establish a new connection for a different session.',
              }),
            );
            return;
          }

          const effectiveChatId = currentChatId;
          const effectiveUserId =
            parsed.userId || ws.auth?.userId || `user-${effectiveChatId.slice(0, 8)}`;

          log.debug(
            `📨 [WebChat] Chat message for [${effectiveChatId}]: ${parsed.text.substring(0, 50)}...`,
          );
          const unifiedMsg: UnifiedMessage = {
            channelId: this.id,
            chatId: effectiveChatId,
            userId: effectiveUserId,
            text: parsed.text,
          };

          await this.onMessageCb(unifiedMsg);
        } else if ((parsed as any).type === 'tool_call') {
          const { id, tool: toolName } = parsed as any;
          log.warn(
            `⚠️ [WebChat] Blocked unauthorized client tool_call attempt: ${toolName} (id: ${id})`,
          );
          ws.send(
            JSON.stringify({
              type: 'tool_response',
              id,
              error:
                'Direct tool calls via WebSocket are not permitted. Tool calls must originate from agent orchestration.',
            }),
          );
        }
      } catch (err) {
        log.error(`❌ [WebChat] Failed to parse message`, err);
      }
    });

    ws.on('close', () => {
      const session = this.chatIdByClient.get(ws);
      this.unregisterClient(ws);
      log.info(
        `🔌 [WebChat] Client disconnected: session=${session} (remaining: ${this.clients.size})`,
      );
    });
  }

  async stop(): Promise<void> {
    log.info('Stopping WebChat channel…');
    if (this.connectionListener) {
      wss.off('connection', this.connectionListener);
      this.connectionListener = undefined;
    }
    this.isStarted = false;
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.clientsByChatId.clear();
    this.chatIdByClient.clear();
  }

  private broadcastToChat(chatId: string, payload: string): boolean {
    const targetClients = this.clientsByChatId.get(chatId);
    if (targetClients && targetClients.size > 0) {
      for (const client of targetClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
      return true;
    }

    if (this.clients.size === 1) {
      const singleClient = this.clients.values().next().value;
      if (singleClient && singleClient.readyState === WebSocket.OPEN) {
        singleClient.send(payload);
        return true;
      }
    }

    return false;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const { OutputFormatter } = await import('./formatter.ts');
    const formattedText = OutputFormatter.format(text, this.preferredFormat);

    const payload = JSON.stringify({
      type: 'message',
      text: formattedText,
      isBot: true,
      chatId,
    });

    const sent = this.broadcastToChat(chatId, payload);
    if (!sent) {
      log.warn(`[WebChat] Dropped outbound message: no active client for session "${chatId}"`);
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    const payload = JSON.stringify({ type: 'typing', chatId });
    this.broadcastToChat(chatId, payload);
  }

  sendToken(chatId: string, token: string): void {
    const payload = JSON.stringify({
      type: 'token',
      token,
      chatId,
    });
    this.broadcastToChat(chatId, payload);
  }

  sendToolStart(chatId: string, toolName: string, input: Record<string, unknown>): void {
    const payload = JSON.stringify({
      type: 'tool_start',
      toolName,
      input,
      chatId,
    });
    this.broadcastToChat(chatId, payload);
  }

  sendToolEnd(
    chatId: string,
    toolName: string,
    success: boolean,
    result?: string,
    durationMs?: number,
  ): void {
    const payload = JSON.stringify({
      type: 'tool_end',
      toolName,
      success,
      result,
      durationMs,
      chatId,
    });
    this.broadcastToChat(chatId, payload);
  }
}
