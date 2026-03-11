# UI Conventions (shadcn-first)

## Component policy
- Prefer `src/components/ui/*` primitives for all UI.
- Add new primitives in `src/components/ui` using shadcn structure (`data-slot`, `cn`, `cva` when needed).
- Avoid one-off utility-heavy markup when a shadcn primitive exists.

## Form policy
- Use `Label`, `Input`, `Button` from `ui` components.
- Use icon-in-input pattern for searchable or credential inputs.
- Keep form spacing consistent (`space-y-4`, `space-y-2`).

## Typography policy
- Use typography primitives from `ui/typography` for headings/body/muted text.
- Keep hierarchy clear: section title, description, content.

## Icon policy
- Use `lucide-react` only.
- Default size `size-4` in controls/labels, muted in supporting context.

## Styling policy
- Use tokenized colors (`primary`, `secondary`, `muted`, `destructive`, `border`, `ring`).
- Keep visual style flat/minimal, low-radius, subtle borders, minimal shadow.

## Layout policy
- Default app layout should use viewport-constrained panels for primary work areas.
- Main working cards should fill available viewport height and keep scrolling inside the card (internal scrollbar), not on the whole page.
