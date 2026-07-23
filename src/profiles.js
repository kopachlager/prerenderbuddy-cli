export const USER_AGENT_PROFILES = Object.freeze({
  browser: {
    label: 'Browser',
    value: 'Mozilla/5.0 (compatible; PrerenderBuddyCLI/0.1; +https://prerenderbuddy.com)',
  },
  googlebot: {
    label: 'Googlebot',
    value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  bingbot: {
    label: 'Bingbot',
    value: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  },
  gptbot: {
    label: 'GPTBot',
    value: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  },
  claudebot: {
    label: 'ClaudeBot',
    value: 'ClaudeBot/1.0; +claudebot@anthropic.com',
  },
});

export function getUserAgentProfile(name = 'googlebot') {
  const normalized = String(name).trim().toLowerCase();
  const profile = USER_AGENT_PROFILES[normalized];
  if (!profile) {
    throw new Error(`Unknown user-agent profile "${name}". Use: ${Object.keys(USER_AGENT_PROFILES).join(', ')}.`);
  }
  return { name: normalized, ...profile };
}
