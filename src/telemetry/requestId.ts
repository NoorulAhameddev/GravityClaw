const HEX_CHARS = "0123456789abcdef";
let counter = 0;

export function generateRequestId(): string {
  const now = Date.now().toString(36);
  const rand = Array.from({ length: 8 }, () => HEX_CHARS[Math.floor(Math.random() * 16)]).join("");
  counter = (counter + 1) % 0xffff;
  const seq = counter.toString(36).padStart(3, "0");
  return `req_${now}_${rand}_${seq}`;
}
