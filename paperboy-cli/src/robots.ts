interface RobotsRule {
  kind: "allow" | "disallow";
  pattern: RegExp;
  length: number;
}

export interface RobotsPolicy {
  rules: readonly RobotsRule[];
  crawlDelaySeconds: number | null;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | undefined;
  let hasDirectives = false;
  const capped = Buffer.from(text, "utf8").subarray(0, 500 * 1024).toString("utf8");

  for (const line of capped.replace(/^\uFEFF/, "").split(/\r\n|[\r\n]/)) {
    const entry = line.split("#", 1)[0].trim();
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const field = entry.slice(0, colon).trim().toLowerCase();
    const value = entry.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!value) continue;
      if (!group || hasDirectives) {
        group = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(group);
        hasDirectives = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (field === "allow" || field === "disallow")) {
      hasDirectives = true;
      if (!value.startsWith("/")) continue;
      const anchored = value.endsWith("$");
      const path = anchored ? value.slice(0, -1) : value;
      const pattern = path.split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      group.rules.push({
        kind: field,
        pattern: new RegExp(`^${pattern}${anchored ? "$" : ""}`),
        length: Buffer.byteLength(value, "utf8"),
      });
    } else if (group && field === "crawl-delay") {
      hasDirectives = true;
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) continue;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        group.crawlDelaySeconds = Math.max(group.crawlDelaySeconds ?? 0, seconds);
      }
    }
  }

  const productToken = "paperboy";
  let selectedToken = "*";
  for (const { agents } of groups) {
    for (const agent of agents) {
      if (agent !== "*" && productToken.includes(agent) &&
          (selectedToken === "*" || agent.length > selectedToken.length)) {
        selectedToken = agent;
      }
    }
  }

  const selectedGroups = groups.filter(({ agents }) => agents.includes(selectedToken));
  const delays = selectedGroups.flatMap(({ crawlDelaySeconds }) =>
    crawlDelaySeconds === null ? [] : [crawlDelaySeconds],
  );
  return {
    rules: selectedGroups.flatMap(({ rules }) => rules),
    crawlDelaySeconds: delays.length > 0 ? Math.max(...delays) : null,
  };
}

export function isAllowedByRobots(policy: RobotsPolicy, pathAndQuery: string): boolean {
  let winner: RobotsRule | undefined;
  for (const rule of policy.rules) {
    if (!rule.pattern.test(pathAndQuery)) continue;
    if (!winner || rule.length > winner.length ||
        (rule.length === winner.length && rule.kind === "allow")) {
      winner = rule;
    }
  }
  return !winner || winner.kind === "allow";
}
