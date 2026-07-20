import { getSessionSettings, updateSessionSetting } from "../../session.ts";
import { getProvider, FailoverProvider, OpenRouterProvider } from "../../llm/index.ts";
import { config } from "../../config.ts";
import type { CommandContext } from "./index.ts";

export async function handleModel(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/).slice(1);

  if (parts.length === 0) {
    const settings = getSessionSettings(sessionId);
    const currentProvider = settings.provider || "<default>";
    const currentModel = settings.model || "<default>";
    await channel.sendMessage(
      msg.chatId,
      "**Current Model Configuration**\n\n" +
      `Provider: ${currentProvider}\nModel: ${currentModel}\n\n` +
      "To change: `/model <provider> <model-name>`\n" +
      "Example: `/model anthropic claude-3-5-sonnet-20241022`\n\n" +
      "Available providers: openrouter, anthropic, openai, google, groq, deepseek, ollama, opencodezen\n" +
      "Use `/models openrouter` to see available OpenRouter models."
    );
    return true;
  }

  const validProviders = ["openrouter", "anthropic", "openai", "google", "groq", "deepseek", "ollama", "opencodezen"];
  let provider: string;
  let model: string;

  if (parts.length === 1) {
    const settings = getSessionSettings(sessionId);
    provider = settings.provider || "openrouter";
    model = parts[0]!;
  } else if (parts.length >= 2 && validProviders.includes(parts[0]!.toLowerCase())) {
    provider = parts[0]!.toLowerCase();
    model = parts.slice(1).join(" ").trim();
  } else {
    const settings = getSessionSettings(sessionId);
    provider = settings.provider || "openrouter";
    model = parts.join(" ").trim();
  }

  updateSessionSetting(sessionId, "provider", provider);
  updateSessionSetting(sessionId, "model", model);

  await channel.sendMessage(
    msg.chatId,
    `Model switched!\n\nProvider: **${provider}**\nModel: **${model}**\n\n` +
    "This setting applies only to this conversation. To change the global default, update your .env file."
  );
  return true;
}

export async function handleModels(ctx: CommandContext): Promise<boolean> {
  const { msg, channel } = ctx;
  const parts = msg.text.trim().split(/\s+/);
  const providerArg = parts[1]?.toLowerCase();
  const targetProvider = providerArg || "openrouter";

  if (targetProvider !== "openrouter") {
    await channel.sendMessage(
      msg.chatId,
      `Model listing for provider '${targetProvider}' is not yet implemented.\n\nCurrently supported: \`/models openrouter\``
    );
    return true;
  }

  const provider = getProvider();
  let openRouterProvider: OpenRouterProvider;

  if (provider instanceof OpenRouterProvider) {
    openRouterProvider = provider;
  } else if (provider instanceof FailoverProvider) {
    const failoverHealth = provider.getHealthStatus();
    const hasOpenRouter = failoverHealth.some(h => h.name === "openrouter");
    if (!hasOpenRouter) {
      await channel.sendMessage(
        msg.chatId,
        "OpenRouter is not available in the current configuration.\n\nTo view OpenRouter models, set `LLM_PROVIDER=openrouter` or include `openrouter` in `LLM_FAILOVER_LIST`."
      );
      return true;
    }
    if (!config.OPENROUTER_API_KEY) {
      await channel.sendMessage(msg.chatId, "OPENROUTER_API_KEY not configured.");
      return true;
    }
    openRouterProvider = new OpenRouterProvider(config.OPENROUTER_API_KEY);
  } else {
    await channel.sendMessage(
      msg.chatId,
      "OpenRouter is not the current provider. Use `/models openrouter` to view OpenRouter models specifically."
    );
    return true;
  }

  try {
    await channel.sendMessage(msg.chatId, "Fetching OpenRouter models...");
    const modelsText = await openRouterProvider.formatModelsForDisplay(20);
    await channel.sendMessage(msg.chatId, modelsText);
  } catch (error) {
    await channel.sendMessage(msg.chatId, "Failed to fetch OpenRouter models. Please try again later.");
  }
  return true;
}
