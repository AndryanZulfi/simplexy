import type { UIAdapterModule } from "../types";
import { parseHermesStdoutLine, createHermesStdoutParser, buildHermesConfig } from "@simplexy/hermes-paperclip-adapter/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const hermesLocalUIAdapter: UIAdapterModule = {
  type: "hermes_local",
  label: "Hermes",
  parseStdoutLine: parseHermesStdoutLine,
  createStdoutParser: createHermesStdoutParser,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildHermesConfig,
};
