#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { describeImageWithAi } from "./ai.js";
import { loadConfig, loadDotenvFromConfigDirectory } from "./config.js";
import { convertFileToMarkdown, type ConvertOptions } from "./converter.js";
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

program
  .name("paperboy-cli")
  .description("Paperboy file-to-markdown converter")
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
  .action(async (options: { json?: boolean }) => {
    const report = await runDoctor();
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
