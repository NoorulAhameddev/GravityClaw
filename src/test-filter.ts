import { registry } from "./tools/index.ts";

console.log("All tools:", registry.getAll().length);
console.log("Tool names:", registry.getAll().map(t => t.name).slice(0, 10));