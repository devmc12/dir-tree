import { en } from './en';
import { zh } from './zh';

/**
 * Date: 2026-06-07
 * Desc: Exposes lightweight playground dictionaries
 */

export const dictionaries = { en, zh } as const;

export type PlaygroundLocale = keyof typeof dictionaries;
export type PlaygroundCopy = (typeof dictionaries)['en'];

export const defaultLocale: PlaygroundLocale = 'en';
