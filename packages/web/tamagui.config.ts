import { defaultConfig } from '@tamagui/config/v6';
import { createTamagui } from 'tamagui';

/**
 * The stock neutrals, re-tuned to the page's own (styles.css): a warm paper
 * canvas and near-black ink in light, the reverse in dark, with one muted
 * level (`color-8`) and one line colour (`border-color`). Tamagui tokens and
 * the CSS variables then agree: `color` is `--ink`, `background` is
 * `--canvas`, `color-8` is `--muted`, `border-color` is `--line`.
 */
const NEUTRALS = {
  light: {
    background: '#fbfaf8',
    'color-1': '#fbfaf8',
    'color-2': '#f1efea',
    'color-3': '#e6e3dd',
    'border-color': '#e6e3dd',
    'color-8': '#6f6e78',
    'color-10': '#3a3a41',
    'color-11': '#131316',
    color: '#131316',
    'placeholder-color': '#a3a1a8',
  },
  dark: {
    background: '#101012',
    'color-1': '#101012',
    'color-2': '#1f1f24',
    'color-3': '#2c2c33',
    'border-color': '#2c2c33',
    'color-8': '#9b9aa3',
    'color-10': '#d9d8d4',
    'color-11': '#f6f5f2',
    color: '#f6f5f2',
    'placeholder-color': '#6c6b75',
  },
} as const;

const FONT = 'Allo, system-ui, -apple-system, "Segoe UI", sans-serif';

export const config = createTamagui({
  ...defaultConfig,
  fonts: {
    body: { ...defaultConfig.fonts.body, family: FONT },
    heading: { ...defaultConfig.fonts.heading, family: FONT },
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, ...NEUTRALS.light },
    dark: { ...defaultConfig.themes.dark, ...NEUTRALS.dark },
  },
});

export type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}
