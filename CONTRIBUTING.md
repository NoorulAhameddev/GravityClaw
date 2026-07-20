# Contributing to Gravity Claw

Thank you for your interest in contributing to Gravity Claw! We welcome contributions from the community.

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/gravityclaw.git
   cd gravityclaw
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   - Copy `.env.example` to `.env`
   - Add your API keys (OpenAI, Anthropic, etc.) or use Ollama for air-gapped mode
   - See [docs/features/airgap/AIRGAP.md](docs/features/airgap/AIRGAP.md) for local-only setup

4. **Run Development Server**
   ```bash
   npm run dev
   ```

5. **Run Tests**
   ```bash
   npm run test:run      # Run all tests
   npm run typecheck     # Type checking
   ```

## Code Standards

- **TypeScript**: All code must be written in TypeScript with strict type checking
- **Testing**: Add tests for new features and bug fixes
- **Code Style**: Follow existing code patterns and formatting
- **Commits**: Write clear, descriptive commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat: add voice wake word detection`
  - `fix: resolve WebSocket reconnection issue`
  - `docs: update canvas integration guide`
  - `refactor: reorganize tool categories`

## Before Submitting

1. **Type Check**: Run `npm run typecheck` to ensure no TypeScript errors
2. **Test Suite**: Run `npm run test:run` to verify all tests pass
3. **Documentation**: Update relevant docs if changing functionality
4. **Commit Messages**: Follow conventional commit format

## Pull Request Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make Your Changes**
   - Keep changes focused and atomic
   - Add tests for new functionality
   - Update documentation as needed

3. **Push and Open PR**
   ```bash
   git push origin feat/your-feature-name
   ```
   - Open a pull request on GitHub
   - Fill out the PR template completely
   - Link any related issues

4. **Code Review**
   - Respond to feedback promptly
   - Push additional commits to address review comments
   - Ensure CI passes before merging

5. **Merge**
   - Once approved and CI passes, a maintainer will merge your PR
   - Your contribution will be credited in the release notes

## Reporting Issues

- **Bugs**: Use the bug report template and include reproduction steps
- **Features**: Use the feature request template and explain the use case
- **Questions**: Start a [Discussion](https://github.com/noorulahamed/gravityclaw/discussions) for general questions

## Development Guidelines

### Project Structure

- `src/` - Core agent logic
  - `agents/` - Multi-agent coordination
  - `channels/` - Communication channels (WhatsApp, Telegram, Web)
  - `llm/` - LLM provider integrations
  - `memory/` - Knowledge persistence
  - `tools/` - Agent capabilities
- `src/web/` - Next.js web UI
- `docs/` - Documentation
- `skills/` - Skill definitions
- `plugins/` - Plugin system

### Adding New Features

**New Tool**: Add to appropriate subdirectory in `src/tools/`, export in `index.ts`

**New LLM Provider**: Implement `LLMProvider` interface in `src/llm/`, add to `createSingleProvider()` in `src/llm/index.ts`

**New Channel**: Extend `Channel` interface in `src/channels/`, register in `ChannelRouter`

**New Skill**: Create markdown file in `skills/`, follow existing format

### Security Considerations

- Never commit API keys, tokens, or credentials
- Use encrypted secrets system (see [docs/ENCRYPTED_SECRETS.md](docs/ENCRYPTED_SECRETS.md))
- Validate all user inputs
- Follow principle of least privilege for file access and tool permissions

## Community

- Be respectful and constructive
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md)
- Help others in discussions and issues
- Share your use cases and feedback

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open a [Discussion](https://github.com/noorulahamed/gravityclaw/discussions)
- Review [Documentation](docs/)
- Check existing [Issues](https://github.com/noorulahamed/gravityclaw/issues)

Thank you for contributing to Gravity Claw! 🚀
