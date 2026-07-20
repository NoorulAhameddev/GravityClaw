import { WebSocket } from "ws";
import type { AuthenticatedSocket } from "../middleware/websocket-auth.js";

declare module "ws" {
  interface WebSocket {
    auth?: AuthenticatedSocket;
    isAlive?: boolean;
  }
}
