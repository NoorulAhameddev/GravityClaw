/**
 * Hello World Example Plugin
 * 
 * Demonstrates the plugin system with simple greeting tools.
 */

import type { Plugin, Tool } from "../../src/plugins/base.js";

interface PluginConfig {
  greetingStyle?: "formal" | "casual" | "friendly";
  includeEmoji?: boolean;
}

export const helloPlugin: Plugin = {
  id: "example-hello",
  name: "Hello World Plugin",
  version: "1.0.0",
  description: "Example plugin with greeting tools",
  
  async initialize(config?: PluginConfig): Promise<void> {
    console.log(`Hello plugin initialized with style: ${config?.greetingStyle || "casual"}`);
  },
  
  async shutdown(): Promise<void> {
    console.log("Hello plugin shutting down");
  },
  
  getTools(): Tool[] {
    return [
      {
        name: "hello_greet",
        description: "Generate a personalized greeting",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name to greet" },
            timeOfDay: { 
              type: "string", 
              enum: ["morning", "afternoon", "evening"],
              description: "Time of day for contextual greeting"
            }
          },
          required: ["name"]
        },
        execute: async (input: Record<string, unknown>) => {
          const name = input.name as string;
          const timeOfDay = (input.timeOfDay as string) || "day";
          
          const greetings: Record<string, string> = {
            morning: "Good morning",
            afternoon: "Good afternoon", 
            evening: "Good evening",
            day: "Hello"
          };
          
          const greeting = greetings[timeOfDay] || "Hello";
          return JSON.stringify({ 
            success: true, 
            message: `${greeting}, ${name}! 👋` 
          });
        }
      },
      {
        name: "hello_farewell",
        description: "Generate a friendly farewell message",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name to say goodbye to" },
            seeYouLater: { type: "boolean", description: "Use casual 'see you later'" }
          },
          required: ["name"]
        },
        execute: async (input: Record<string, unknown>) => {
          const name = input.name as string;
          const casual = input.seeYouLater as boolean;
          
          const message = casual 
            ? `See you later, ${name}! Have a great day! 👋`
            : `Goodbye, ${name}! It was wonderful chatting with you. Take care! ✨`;
            
          return JSON.stringify({ success: true, message });
        }
      }
    ];
  },
  
  getTraits(): string[] {
    return ["tool"];
  }
};

export default helloPlugin;