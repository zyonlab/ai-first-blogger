import type reference from './zh-CN';

/** A message is a plain string, or an array of lines joined with newlines. */
export type MessageValue = string | readonly string[];

/** Every key defined by the reference locale. */
export type MessageKey = keyof typeof reference;

/**
 * Shape every locale file must satisfy. A locale missing a key — or inventing
 * one — fails `pnpm check`.
 */
export type MessageTable = Record<MessageKey, MessageValue>;
