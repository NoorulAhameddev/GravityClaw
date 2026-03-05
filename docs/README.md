# Gravity Claw Documentation

Welcome to the Gravity Claw documentation. This directory is organized by topic for easy navigation.

## 📁 Directory Structure

### `/architecture` - System Architecture
Core architectural documentation for understanding the overall system design:
- **ARCHITECTURE_OVERVIEW.md** - Complete overview of the Gravity Claw architecture
- **ARCHITECTURE.md** - Detailed architecture documentation with diagrams

### `/guides` - User Guides
Step-by-step guides for using and deploying Gravity Claw:
- **API.md** - API reference documentation
- **CLI.md** - Command-line interface guide
- **DEPLOYMENT.md** - Deployment instructions and best practices
- **MODEL_SWITCHING.md** - Guide to switching between different LLM models

### `/features` - Feature Documentation
In-depth documentation for specific features, organized by feature:

#### `/features/airgap`
Air-gapped mode documentation for secure, offline operation.

#### `/features/backup`
Complete backup and restore system documentation:
- System architecture and implementation
- Quick start guides
- Usage examples and shell scripts

#### `/features/canvas`
Live Canvas (A2UI) feature documentation.

#### `/features/dashboard`
Web dashboard documentation including:
- Integration guides
- Analytics and admin features

#### `/features/export`
Data export functionality documentation.

#### `/features/observability`
Comprehensive observability system documentation (9 docs):
- Core observability concepts
- Implementation guides
- Quick references
- Integration examples
- Metrics, logging, and tracing

#### `/features/performance`
Performance optimization documentation:
- Implementation details
- Setup guides
- Performance tuning

#### `/features/rate-limiting`
Rate limiting system documentation (4+ docs):
- Architecture and concepts
- Configuration guides
- Implementation summaries
- Quick references

#### `/features/security`
Security implementation documentation:
- Security setup
- Implementation details
- Quick reference guides

#### `/features/touch-gestures`
Mobile touch gesture system documentation for PWA.

### `/archive` - Historical Documentation
Completed delivery reports, progress tracking, and deprecated documentation:
- Integration test deliveries
- Feature completion reports
- Progress tracking documents
- Temporary status files

## 🔍 Quick Navigation

**Getting Started:**
1. Read [ARCHITECTURE_OVERVIEW.md](architecture/ARCHITECTURE_OVERVIEW.md) to understand the system
2. Follow [DEPLOYMENT.md](guides/DEPLOYMENT.md) to deploy
3. Check [API.md](guides/API.md) for API reference

**Feature-Specific:**
- For observability: Start with [features/observability/OBSERVABILITY_START_HERE.md](features/observability/OBSERVABILITY_START_HERE.md)
- For rate limiting: See [features/rate-limiting/RATE_LIMITING.md](features/rate-limiting/RATE_LIMITING.md)
- For backups: Read [features/backup/BACKUP_QUICKSTART.md](features/backup/BACKUP_QUICKSTART.md)

**Development:**
- See [../examples/](../examples/) directory for code examples
- Check [../src/__tests__/README.md](../src/__tests__/README.md) for testing guide

## 📝 Documentation Standards

All documentation follows these guidelines:
- Markdown format with clear headings
- Code examples with syntax highlighting
- Table of contents for long documents
- Cross-references using relative links
- Last updated dates where applicable

## 🤝 Contributing

When adding new documentation:
1. Place feature docs in `/features/<feature-name>/`
2. Place guides in `/guides/`
3. Update this README with links
4. Follow existing naming conventions
5. Add a table of contents for docs > 200 lines

For more details, see [../CONTRIBUTING.md](../CONTRIBUTING.md).
