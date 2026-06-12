/**
 * CLI utility: validate all fixture JSON files against their schemas.
 * Run: ts-node utils/validate-schemas.ts
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "fs";
import * as path from "path";

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

const SCHEMAS_DIR = path.join(__dirname, "../schemas");
const FIXTURES_DIR = path.join(__dirname, "../fixtures");

function loadSchema(name: string) {
  const file = path.join(SCHEMAS_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const requestSchema   = loadSchema("inspection-request.schema.json");
const resultSchema    = loadSchema("inspection.schema.json");
const scoreSchema     = loadSchema("score.schema.json");
const webhookSchema   = loadSchema("webhook.schema.json");

ajv.addSchema(requestSchema, requestSchema.$id);
ajv.addSchema(resultSchema,  resultSchema.$id);
ajv.addSchema(scoreSchema,   scoreSchema.$id);
ajv.addSchema(webhookSchema, webhookSchema.$id);

function validateFixture(fixtureName: string, schemaId: string): boolean {
  const fixturePath = path.join(FIXTURES_DIR, fixtureName);
  const data = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    console.error(`  Schema not found: ${schemaId}`);
    return false;
  }
  const valid = validate(data);
  if (!valid) {
    console.error(`  FAIL ${fixtureName}:`);
    (validate.errors ?? []).forEach((e) =>
      console.error(`    [${e.instancePath}] ${e.message}`)
    );
    return false;
  }
  console.log(`  PASS ${fixtureName}`);
  return true;
}

const results = [
  validateFixture(
    "example-inspection-result.json",
    "https://ouroboros/schemas/inspection.schema.json"
  ),
];

const allPassed = results.every(Boolean);
console.log(allPassed ? "\nAll schema validations passed." : "\nSome validations failed.");
process.exit(allPassed ? 0 : 1);
