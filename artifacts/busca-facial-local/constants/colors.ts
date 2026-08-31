/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#F8FAFC',
    tint: '#818CF8',

    // Core surfaces
    background: '#080B14',
    foreground: '#F8FAFC',

    // Cards / elevated surfaces
    card: '#101628',
    cardForeground: '#F8FAFC',

    // Primary action color (buttons, links, active states)
    primary: '#6366F1',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#18213A',
    secondaryForeground: '#E2E8F0',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#151D31',
    mutedForeground: '#94A3B8',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#25235C',
    accentForeground: '#C7D2FE',

    // Destructive actions (delete, error states)
    destructive: '#F87171',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#27324B',
    input: '#293550',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
