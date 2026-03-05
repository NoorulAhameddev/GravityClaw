# Gravity Claw - Code Examples

This directory contains runnable code examples and snippets for various Gravity Claw features.

## 📁 Directory Structure

### `/backup`
Backup system usage examples:
- **BACKUP_USAGE_EXAMPLES.ts** - TypeScript examples for backup operations
- **BACKUP_ENV_EXAMPLE.sh** - Shell script for environment setup

### `/rate-limiting`
Rate limiting system examples:
- **RATE_LIMITING_CHANGES.ts** - Example rate limiting changes
- **RATE_LIMITING_CONFIG.ts** - Configuration examples
- **RATE_LIMITING_VALIDATION.ts** - Validation examples
- **rate-limiting-examples.ts** - General rate limiting examples

### `/observability`
Observability system examples (to be added).

## 🚀 Running Examples

Most examples are TypeScript modules that can be executed with:

```bash
npx tsx examples/<category>/<example-file>.ts
```

For example:
```bash
npx tsx examples/backup/BACKUP_USAGE_EXAMPLES.ts
npx tsx examples/rate-limiting/rate-limiting-examples.ts
```

## 📚 Documentation

For detailed documentation on each feature, see the [docs/features](../docs/features/) directory:
- [Backup System](../docs/features/backup/)
- [Rate Limiting](../docs/features/rate-limiting/)
- [Observability](../docs/features/observability/)

## 🤝 Contributing Examples

When adding new examples:
1. Create a new subdirectory for the feature if needed
2. Name files descriptively (e.g., `feature-usage-example.ts`)
3. Include inline comments explaining the code
4. Add an entry to this README
5. Ensure examples are self-contained and runnable

For complex examples, consider adding:
- A dedicated README in the subdirectory
- Sample input/output
- Prerequisites and dependencies

## ⚠️ Note

These are examples for learning and reference. Always review and adapt code for your specific use case before using in production.
