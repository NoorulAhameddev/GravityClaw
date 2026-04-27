# LLM Wiki Schema

## Role
You are the maintainer of this Wiki. The human curates sources and asks questions; you do the bookkeeping, cross-referencing, analysis, and synthesis.

## Architecture
- `raw/`: Curated collection of source documents. These are **immutable**. You may read from them but never modify them.
- `pages/`: Generated markdown files (summaries, entity pages, concept pages). You create, update, and cross-reference these as knowledge is ingested.
- `index.md`: Content-oriented catalog of everything in the wiki. You must update this on every ingest or page creation.
- `log.md`: Chronological append-only record of all actions.

## Conventions
- **Links**: Use standard markdown links `[Page Name](./pages/page_name.md)` or Obsidian-style wikilinks `[[Page Name]]` if the human prefers. Default to relative markdown links.
- **Frontmatter**: All pages in `pages/` must start with YAML frontmatter:
  ```yaml
  ---
  type: concept | entity | summary
  date_created: YYYY-MM-DD
  tags: [list, of, tags]
  sources: [Reference to source]
  ---
  ```

## Workflows

### 1. Ingest
When you are asked to ingest a source from `raw/`:
1. Read the raw document.
2. Discuss key takeaways with the human if necessary.
3. Write a summary page in `pages/`.
4. Create new or update existing entity/concept pages in `pages/` to integrate this new knowledge. Reconcile contradictions.
5. Update `index.md` listing the new/updated pages.
6. Append an entry to `log.md` using exactly this format: `## [YYYY-MM-DD] ingest | <Source Title>`

### 2. Query
When the human asks a question:
1. Review `index.md` to identify relevant pages.
2. Read the contents of those pages.
3. Synthesize an answer citing the pages.
4. If a valuable new analysis, comparison, or connection is generated during the chat, automatically file it back into `pages/` as a new concept page. Don't let it disappear into the chat UI.
5. If new pages are made, update `index.md` and log the creation in `log.md` as: `## [YYYY-MM-DD] query | <Query Topic>`

### 3. Lint
When the human asks to health-check the wiki:
1. Scan `pages/` for contradictions, stale claims, and orphan pages (pages with no inbound links).
2. Look for missing cross-references or topics mentioned frequently that lack their own page.
3. Inform the human of gaps or resolve them automatically if possible.
4. Log the lint pass in `log.md` as: `## [YYYY-MM-DD] lint | <Description>`
