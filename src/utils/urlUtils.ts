/**
 * True only for a recognizable YouTube video link — watch?v=, youtu.be/<id>,
 * /embed/<id> or /shorts/<id> on youtube.com / youtu.be. Mirrors the
 * frontend's getYouTubeEmbedUrl (src/utils/utils.ts) so both sides accept
 * exactly the same set of links.
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.replace(/^www\.|^m\./, "");

    if (host === "youtu.be") return parsed.pathname.length > 1;
    if (host === "youtube.com") {
      if (parsed.pathname === "/watch") return !!parsed.searchParams.get("v");
      return /^\/(embed|shorts)\/[^/]+/.test(parsed.pathname);
    }
    return false;
  } catch {
    return false;
  }
}
