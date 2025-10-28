You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When creating new components or pages, always use external HTML template files (e.g., `my-component.component.html`) and reference them with `templateUrl`.
- Do NOT use inline `template` or `styles` in the `@Component` decorator. Use `styleUrls` to point to one or more external CSS/SCSS files.
- Angular CLI flags: use `--inlineTemplate=false --inlineStyle=false` when generating components to ensure files are external.

Additional project rules:

- Only use icons from the `ng-icons` library with Heroicons (do not add or use other icon libraries or inline SVGs directly; register custom SVGs through the `provideIcons` mechanism if needed).
- Do NOT leave comments in code. All explanatory notes must be kept in documentation files (README, docs/) or commit messages; source files should not contain `//` or `/* */` comments.
- Always use Transloco for UI text and do NOT display hard-coded strings in templates or components; all user-facing strings must come from translation keys.
- Every HTML element you add in templates must include an `id` attribute that is unique within its document to simplify automation tasks.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Styling (Tailwind-only)

- Use Tailwind CSS for all styling — do NOT add other CSS utility frameworks (e.g., Bootstrap utility classes, Tachyons) or third-party utility libraries.
- Prefer Tailwind utility classes and component-focused CSS only. Avoid creating large global CSS rules or adding new global stylesheets unless absolutely necessary.
- Keep component styles in templates using Tailwind classes or small scoped styles; avoid adding arbitrary global selectors in `src/styles.css`.
- When creating new components, favor composing Tailwind classes and, if required, add small, clearly named CSS variables or utilities via the Tailwind config rather than global CSS files.

## UI theming and layout

- Applications must support both `light` and `dark` themes. Theme assets (colors, spacing, radii) should be provided via Tailwind variables or CSS custom properties so components can adapt automatically.
- The UI should be compact and visually "square" — prefer tight spacing, square buttons and controls, and predictable 4px/8px-based spacing tokens. Avoid large rounded corners and excessive whitespace by default.
- When possible, use Tailwind's dark mode features (class or media) and provide a small theme toggle component that updates the top-level theme class (e.g., `class="dark"`).

Examples and rationale:

- Use a small set of design tokens for spacing and radii (e.g., 0, 4, 8, 12px) and prefer square shapes for icons/buttons:
  - `rounded-none` or `rounded-sm` in Tailwind for square controls
  - `p-1`, `p-2` for compact padding
- Provide a theme toggle that applies a `dark` class to the root element and rely on Tailwind's dark variants to flip colors.

Note: This project uses Tailwind-only styling. Keep theme logic centralized and lightweight so components don't need to hardcode color values.
