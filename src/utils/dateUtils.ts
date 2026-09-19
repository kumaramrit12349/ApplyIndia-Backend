/** en-IN formats am/pm in lowercase ("6:15 am"); the platform shows it uppercase ("6:15 AM"). */
export function upperAmPm(formatted: string): string {
  return formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
}
