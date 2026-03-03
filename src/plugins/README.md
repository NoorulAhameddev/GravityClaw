# Plugin System

The canonical plugin system lives in `src/plugins/`.

## Plugins vs Skills

- **Plugins (`src/plugins/`)** are runtime extensions loaded by the plugin registry. They can implement one or more traits (`provider`, `channel`, `tool`, `memory`) and participate directly in agent execution.
- **Skills (`skills/`)** are prompt/knowledge assets used by the assistant for guidance and behavior. They are not runtime plugin modules and are not loaded by the plugin registry.

## Create a Plugin

1. Create a new folder (for external plugins) with a `plugin.json` manifest and an entry module.
2. Export a default object that satisfies the `Plugin` interface from `src/plugins/base.ts`.
3. Implement one or more traits and return them from `getTrait(...)`.
4. Register/discover and load the plugin through the registry (`src/plugins/registry.ts`).

## Minimal Plugin Structure

```text
my-plugin/
├── plugin.json
└── index.ts
```

### `plugin.json` (required fields)

- `id`
- `name`
- `version`
- `main`
- `traits` (any of: `provider`, `channel`, `tool`, `memory`)

## Plugin Interface Reference

Core types and interfaces:

- `Plugin`, `PluginMetadata`, and trait interfaces: `src/plugins/base.ts`
- Discovery, registration, lifecycle management: `src/plugins/registry.ts`

## Example Reference

For a practical example of plugin shape, trait implementation, and lifecycle behavior, see the plugin tests in `src/__tests__/plugins.test.ts`.