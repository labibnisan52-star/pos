<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:i18n-rules -->
# Localization & Bengali UI Rules

1. All user-facing text must come from the centralized translation dictionary (`src/lib/i18n/bn.ts` and `src/lib/i18n/en.ts`, accessed via `useTranslation` / `translate` from `@/lib/i18n`). Never hardcode user-facing strings in components.
2. When editing or rewriting any component, preserve the existing `t(...)` keys and Bengali translations. Never replace them with English text.
3. Any new UI text must be added to both `bn` and `en` dictionaries, with Bengali (`bn`) as the default locale.
4. Money amounts and numeric quick-chip values always use English digits (`0-9`).
5. Remove `uppercase` and `tracking-wide` / `tracking-wider` classes from Bengali labels, and ensure `Noto Sans Bengali` (`--font-noto-bengali`) is applied so Bengali glyphs render properly.
<!-- END:i18n-rules -->
