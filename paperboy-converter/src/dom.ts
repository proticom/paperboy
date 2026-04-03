import { DOMParser } from "linkedom";

export function parseHtml(input: string): any {
  return new DOMParser().parseFromString(input, "text/html");
}

export function parseXml(input: string): any {
  return new DOMParser().parseFromString(input, "text/xml");
}
