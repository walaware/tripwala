// Link-preview crawlers (iMessage, Slack, Telegram, WhatsApp, Discord, etc.)
// fetch pages without a session cookie. Trip pages are private, so signed-out
// humans get redirected to sign in — but a bot can't sign in, and redirecting it
// yields an ugly "Sign in — tripwala" unfurl. Instead we sniff the User-Agent and
// serve those bots a minimal, generic preview (trip name only, no details).

// Matches the well-known unfurl bots plus the generic bot/crawler/spider tokens.
// Deliberately broad: a false positive just means a bot-shaped client sees the
// generic preview instead of the login redirect — no data leaks either way.
const CRAWLER_UA =
  /facebookexternalhit|facebookcatalog|Twitterbot|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|WhatsApp|LinkedInBot|Applebot|Googlebot|bingbot|redditbot|Pinterest|vkShare|SkypeUriPreview|Embedly|Iframely|Quora Link Preview|nuzzel|Google-InspectionTool|bot|crawler|spider|preview/i;

/**
 * Whether a request looks like a link-preview crawler rather than a person.
 * @param {string | null | undefined} userAgent the request's User-Agent header
 * @returns {boolean}
 */
export function isCrawler(userAgent) {
  return !!userAgent && CRAWLER_UA.test(userAgent);
}
