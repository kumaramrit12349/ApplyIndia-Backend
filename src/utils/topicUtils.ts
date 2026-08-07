export const TOPICS: { value: string; label: string }[] = [
  { value: "ssc", label: "SSC" },
  { value: "railway", label: "Railway" },
  { value: "banking", label: "Banking" },
  { value: "defence", label: "Defence" },
  { value: "state-govt-jobs", label: "State Government Jobs" },
  { value: "admissions", label: "Admissions" },
  { value: "scholarships", label: "Scholarships" },
  { value: "results", label: "Results" },
  { value: "admit-cards", label: "Admit Cards" },
];

const TOPIC_PATTERNS: [string, RegExp][] = [
  ["ssc", /\bssc\b|staff\s*selection/],
  ["railway", /\brailway\b|\brrb\b|\birctc\b/],
  ["banking", /\bbank\b|\bibps\b|\brbi\b|\bsbi\b|\bnabard\b/],
  ["defence", /\barmy\b|\bnavy\b|\bair\s*force\b|defence|defense|\bcrpf\b|\bbsf\b|\bcisf\b|\bitbp\b/],
  ["state-govt-jobs", /state\s*(government|govt)|\bpsc\b/],
  ["admissions", /admission|entrance|neet|jee|ctet|cuet|\bcat\b|\bmat\b|\bxat\b|\bgate\b/],
  ["scholarships", /scholarship/],
  ["results", /result|cutoff|cut-off|merit\s*list|score\s*card/],
  ["admit-cards", /admit\s*card|hall\s*ticket|exam\s*city/],
];

/**
 * Best-effort keyword matcher inferring which subscription topics a
 * notification belongs to, from its title/department text. Mirrors the
 * style of inferCategory/inferState in src/scraper/normalizer.ts. Unlike
 * category, a notification can match multiple topics.
 */
export function inferTopics(title: string, department?: string): string[] {
  const text = `${title || ""} ${department || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) matched.push(topic);
  }
  return matched;
}
