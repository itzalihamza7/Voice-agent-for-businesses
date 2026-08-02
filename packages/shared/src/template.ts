// Fills {{variable}} placeholders, e.g. "Thanks, {{caller_name}}" → "Thanks, Ali".
// Unknown variables are left as they are, so a missing answer is visible instead of blank.

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function renderTemplate(text: string, variables: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER, (match, name: string) => variables[name] ?? match);
}
