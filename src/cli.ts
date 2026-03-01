#!/usr/bin/env node
import { Command } from "commander";
import { CliExportOptions } from "./config";
import {
  EXIT_EXTRACTION_FAILED,
  EXIT_VALIDATION_ERROR,
  runExportJob
} from "./core/run-export";

function parseOptionalNumber(value: string): number {
  return Number(value);
}

async function main(): Promise<void> {
  const program = new Command();
  program.name("amazon-orders").description("Export Amazon.com orders to CSV/XLSX");

  program
    .command("export")
    .description("Export orders for a date range")
    .requiredOption("--from <YYYY-MM-DD>", "Start date, inclusive")
    .requiredOption("--to <YYYY-MM-DD>", "End date, inclusive")
    .requiredOption("--out <directory>", "Output directory")
    .option("--format <csv|xlsx|both>", "Output format", "both")
    .option("--headless <boolean>", "Run browser headless (default: false)", false)
    .option("--max-orders <number>", "Maximum orders to process", parseOptionalNumber, 5000)
    .option("--max-range-days <number>", "Max allowable date range in days", parseOptionalNumber, 365)
    .option(
      "--login-timeout-seconds <number>",
      "Time to wait for login/orders page readiness",
      parseOptionalNumber,
      900
    )
    .option("--debug", "Write debug HTML snapshots for failed order pages", false)
    .action(async (options: CliExportOptions) => {
      const outcome = await runExportJob(options);
      process.exitCode = outcome.exitCode;
      if (outcome.exitCode === EXIT_VALIDATION_ERROR && outcome.errorMessage) {
        console.error(outcome.errorMessage);
      }
    });

  await program.parseAsync(process.argv);

  if (process.argv.length <= 2) {
    program.outputHelp();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(EXIT_EXTRACTION_FAILED);
});
