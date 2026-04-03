import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });

  service.use(gfm);
  service.addRule("removeScriptLikeTags", {
    filter(node) {
      const tag = node.nodeName;
      return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT";
    },
    replacement() {
      return "";
    },
  });

  return service;
}
