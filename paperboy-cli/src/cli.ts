#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { describeImageWithAi } from "./ai.js";
import { loadConfig, loadDotenvFromConfigDirectory } from "./config.js";
import { convertFileToMarkdown, type ConvertOptions } from "./converter.js";
import { crawlSite } from "./crawl.js";
import { printDoctorReport, runDoctor } from "./doctor.js";
import { runSetup } from "./setup.js";

loadDotenvFromConfigDirectory();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
  version: string;
};

const program = new Command();

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or a positive integer.`);
  }
  return parsed;
}

function parsePatternArgs(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

program
  .name("paperboy")
  .description("Paperboy file and web content to markdown converter")
  .version(packageJson.version);

program
  .command("setup")
  .description("Interactive setup for AI provider and key storage")
  .action(async () => {
    await runSetup();
  });

program
  .command("convert <inputPath>")
  .description("Convert a supported file into markdown")
  .option("-o, --output <path>", "Output markdown file path")
  .option("--stdout", "Print markdown to stdout instead of writing file")
  .option("--describe-image", "Use configured AI to add image description section")
  .option("--no-layout-table", "Skip OCR positioning table for image conversion")
  .option("--json", "Print JSON metadata about the conversion")
  .action(
    async (
      inputPath: string,
      options: {
        output?: string;
        stdout?: boolean;
        describeImage?: boolean;
        layoutTable?: boolean;
        json?: boolean;
      },
    ) => {
      const absoluteInputPath = path.resolve(process.cwd(), inputPath);
      const config = await loadConfig();
      const convertOptions: ConvertOptions = {
        image: {
          includeLayoutTable: options.layoutTable ?? config.defaults.includeLayoutTable,
        },
      };

      const shouldDescribe =
        options.describeImage || config.defaults.describeImagesWithAi;
      if (shouldDescribe && config.ai.mode !== "disabled") {
        convertOptions.image = {
          ...convertOptions.image,
          describeImage: async (params) =>
            describeImageWithAi({
              config,
              imageBytes: params.fileBytes,
              imageMimeType: params.imageMimeType,
              ocrText: params.ocrText,
              words: params.words,
            }),
        };
      }

      const result = await convertFileToMarkdown(absoluteInputPath, convertOptions);
      const outputPath = options.output
        ? path.resolve(process.cwd(), options.output)
        : path.join(path.dirname(absoluteInputPath), `${result.title}.md`);

      if (!options.stdout) {
        await fs.writeFile(outputPath, result.markdown, "utf8");
      }

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              inputPath: absoluteInputPath,
              outputPath: options.stdout ? null : outputPath,
              title: result.title,
              warnings: result.warnings,
              markdown: options.stdout ? result.markdown : undefined,
            },
            null,
            2,
          ),
        );
      } else {
        if (options.stdout) {
          console.log(result.markdown);
        } else {
          console.log(`Wrote markdown to ${outputPath}`);
        }
        if (result.warnings.length > 0) {
          console.log("");
          console.log("Warnings:");
          for (const warning of result.warnings) {
            console.log(`- ${warning}`);
          }
        }
      }
    },
  );

program
  .command("crawl <url>")
  .description("Crawl a webpage or site and convert pages to markdown")
  .option(
    "--max-pages <number>",
    "Maximum number of pages to process",
    (value) => parsePositiveInt(value, "max-pages"),
    300,
  )
  .option(
    "--max-depth <number>",
    "Maximum crawl depth from seed URLs",
    (value) => parseNonNegativeInt(value, "max-depth"),
    4,
  )
  .option(
    "--include-patterns <patterns>",
    "Comma-separated regex patterns for URLs to include",
  )
  .option(
    "--exclude-patterns <patterns>",
    "Comma-separated regex patterns for URLs to skip",
  )
  .option(
    "--min-content-words <number>",
    "Skip converted pages smaller than this word count",
    (value) => parseNonNegativeInt(value, "min-content-words"),
    0,
  )
  .option(
    "--output-mode <mode>",
    "Output mode: single | mirror | jsonl",
    "single",
  )
  .option("-o, --output <path>", "Output file path (single/jsonl) or directory (mirror)")
  .option("--map", "Discovery-only mode (list URLs, no markdown conversion)")
  .option("--json", "Print crawl report JSON to stdout")
  .option(
    "--rate-limit-ms <number>",
    "Delay between requests in milliseconds",
    (value) => parseNonNegativeInt(value, "rate-limit-ms"),
    500,
  )
  .option(
    "--timeout-ms <number>",
    "HTTP request timeout in milliseconds",
    (value) => parsePositiveInt(value, "timeout-ms"),
    10000,
  )
  .option(
    "--max-sitemaps <number>",
    "Maximum sitemap files to traverse",
    (value) => parsePositiveInt(value, "max-sitemaps"),
    20,
  )
  .action(
    async (
      url: string,
      options: {
        maxPages: number;
        maxDepth: number;
        includePatterns?: string;
        excludePatterns?: string;
        minContentWords: number;
        outputMode: string;
        output?: string;
        map?: boolean;
        json?: boolean;
        rateLimitMs: number;
        timeoutMs: number;
        maxSitemaps: number;
      },
    ) => {
      const outputMode = options.outputMode.toLowerCase();
      if (!["single", "mirror", "jsonl"].includes(outputMode)) {
        throw new Error("output-mode must be one of: single, mirror, jsonl");
      }

      const result = await crawlSite(url, {
        maxPages: options.maxPages,
        maxDepth: options.maxDepth,
        includePatterns: parsePatternArgs(options.includePatterns),
        excludePatterns: parsePatternArgs(options.excludePatterns),
        minContentWords: options.minContentWords,
        outputMode: outputMode as "single" | "mirror" | "jsonl",
        outputPath: options.output,
        json: Boolean(options.json),
        mapOnly: Boolean(options.map),
        rateLimitMs: options.rateLimitMs,
        timeoutMs: options.timeoutMs,
        maxSitemaps: options.maxSitemaps,
        userAgent: `paperboy/${packageJson.version} (+https://github.com/proticom/paperboy)`,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.mode === "map") {
        console.log(`Discovered ${result.discoveredCount} URLs.`);
        for (const discovered of result.discoveredUrls) {
          console.log(`- ${discovered.url} [${discovered.source}]`);
        }
        if (result.outputPath) {
          console.log(`Saved discovery output to ${result.outputPath}`);
        }
      } else {
        console.log(
          `Crawled ${result.crawledCount} pages (discovered ${result.discoveredCount}).`,
        );
        if (result.outputPath) {
          console.log(`Wrote output to ${result.outputPath}`);
        }
      }

      if (result.warnings.length > 0) {
        console.log("");
        console.log("Warnings:");
        for (const warning of result.warnings) {
          console.log(`- ${warning}`);
        }
      }
    },
  );

program
  .command("config show")
  .description("Show current Paperboy CLI configuration")
  .action(async () => {
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command("doctor")
  .description("Run environment diagnostics for conversion and AI setup")
  .option("--json", "Print doctor report as JSON")
  .option("--offline", "Skip the internet reachability check")
  .action(async (options: { json?: boolean; offline?: boolean }) => {
    const report = await runDoctor({ offline: options.offline });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printDoctorReport(report);
    if (report.summary.fail > 0) {
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
