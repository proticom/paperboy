export {
  convertFileToMarkdown,
  SUPPORTED_EXTENSIONS,
  type ConvertOptions,
  type ConvertResult,
  type OcrWordPosition,
} from "./converter.js";
export {
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  CONFIG_PATH,
  DOTENV_PATH,
  OPENROUTER_ENV_VAR,
  type PaperboyCliConfig,
} from "./config.js";
export { runSetup } from "./setup.js";
export { runDoctor, printDoctorReport, type DoctorReport } from "./doctor.js";
