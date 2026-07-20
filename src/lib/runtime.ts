import { config } from "../config.ts";

let actualPort: number | undefined;

export function getActualPort(): number {
  return actualPort ?? config.PORT ?? 3000;
}

export function setActualPort(port: number): void {
  actualPort = port;
}
