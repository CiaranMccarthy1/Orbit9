/**
 * Find an element by id, or throw a clear error.
 *
 * Prefer this over `document.getElementById('x')!`. The `!` hides a typo or
 * a renamed id until some later line fails with a vague null error; this
 * helper names the missing id and points at index.html immediately.
 */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}. Check index.html.`);
  return element as T;
}
