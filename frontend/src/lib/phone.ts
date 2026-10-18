/** `tel:` URL for a stored phone number, or null if there isn't one. */
export function telUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}
