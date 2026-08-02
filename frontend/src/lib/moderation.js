const harmfulTermPatterns = [
  "ass",
  "asshole",
  "bastard",
  "bitch",
  "bullshit",
  "crap",
  "damn",
  "dick",
  "dumb",
  "dumbass",
  "fag",
  "faggot",
  "fuck",
  "fucked",
  "fucker",
  "fucking",
  "hoe",
  "idiot",
  "jerk",
  "loser",
  "moron",
  "nigga",
  "nigger",
  "piss",
  "prick",
  "psycho",
  "retard",
  "retarded",
  "shit",
  "shitty",
  "slut",
  "stupid",
  "trash",
  "ugly",
  "whore",
  "worthless",
  "you suck",
  "screw you",
  "shut up",
  "hate you",
  "go away",
  "no one likes you",
  "nobody likes you",
  "everyone hates you",
  "you are nothing",
  "you are useless",
  "you are worthless",
  "go kill yourself",
  "go die",
  "kill yourself",
  "kys",
];

const severeTermPatterns = [
  "fag",
  "faggot",
  "nigga",
  "nigger",
  "retard",
  "retarded",
  "go kill yourself",
  "go die",
  "kill yourself",
  "kys",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTermRegex(term) {
  const escapedTerm = escapeRegExp(term).replace(/\s+/g, "\\s+");

  return new RegExp(`(^|[^\\p{L}\\p{N}])(${escapedTerm})(?=$|[^\\p{L}\\p{N}])`, "giu");
}

function maskTerm(term) {
  return "*".repeat(Math.max(term.length, 3));
}

export function moderateText(text) {
  const originalText = String(text || "");
  let filteredText = originalText;
  const matchedTerms = [];

  harmfulTermPatterns.forEach((term) => {
    const regex = getTermRegex(term);

    filteredText = filteredText.replace(regex, (match, prefix, matchedTerm) => {
      matchedTerms.push(term);
      return `${prefix}${maskTerm(matchedTerm)}`;
    });
  });

  const uniqueTerms = [...new Set(matchedTerms)];
  const severeMatches = uniqueTerms.filter((term) =>
    severeTermPatterns.includes(term),
  );

  return {
    originalText,
    filteredText,
    matchedTerms: uniqueTerms,
    matchedTermCount: matchedTerms.length,
    hasFilteredLanguage: filteredText !== originalText,
    shouldReport: matchedTerms.length >= 2 || severeMatches.length > 0,
    severity: severeMatches.length > 0 ? "high" : matchedTerms.length >= 2 ? "medium" : "low",
  };
}

export function recordModerationStrike({ userId, clubId }) {
  if (!userId || !clubId) {
    return { strikeCount: 0, shouldReportRepeat: false };
  }

  const key = `litshelf-club-moderation-${userId}-${clubId}`;
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  try {
    const savedStrikes = JSON.parse(localStorage.getItem(key));
    const recentStrikes = Array.isArray(savedStrikes)
      ? savedStrikes.filter((timestamp) => Number(timestamp) > oneDayAgo)
      : [];

    const nextStrikes = [...recentStrikes, now];
    localStorage.setItem(key, JSON.stringify(nextStrikes));

    return {
      strikeCount: nextStrikes.length,
      shouldReportRepeat: nextStrikes.length >= 3,
    };
  } catch {
    localStorage.setItem(key, JSON.stringify([now]));

    return { strikeCount: 1, shouldReportRepeat: false };
  }
}
