import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `buildSystemPrompt` now lives only in `scenario-write/prompt.ts`.
 *
 * Before this PR, `index.ts` BOTH imported that binding and declared its own
 * function of the same name:
 *
 *     line   8: import { buildSystemPrompt, ... } from "./prompt.ts";
 *     line  92: export function buildSystemPrompt(
 *
 * That is not a style problem — it is a load-time SyntaxError, "Identifier
 * 'buildSystemPrompt' has already been declared". The module cannot be
 * evaluated, so the whole scenario-write function is dead on arrival.
 *
 * Nothing in CI could see it: `tsconfig.app.json` is `"include": ["src"]`, so
 * `supabase/functions/**` is never typechecked, and this project has no
 * `deno check` step. Hence the source-shape guard at the bottom of this file.
 *
 * Importing the builder directly also drops the four `vi.mock` calls and the
 * global `Deno` stub this file used to need — `prompt.ts` pulls in only
 * `scenario-policy.ts`.
 */
import { buildSystemPrompt } from "../supabase/functions/scenario-write/prompt.ts";

const INDEX_SRC = readFileSync("supabase/functions/scenario-write/index.ts", "utf8");

describe("scenario-write narration policy", () => {
  const productWithCharacter = {
    productName: "AeroPress",
    productDescription: "Portable coffee maker",
    characterImageUrl: "https://example.com/character.png",
  };

  it("keeps a product-ad character silent when narration is disabled", () => {
    const prompt = buildSystemPrompt(15, productWithCharacter, false, undefined, undefined, "en", false);

    expect(prompt).toContain("must remain SILENT");
    expect(prompt).toContain("no spoken words, no dialogue, no voiceover");
    expect(prompt).toContain("Use the character in CHARACTER-ONLY shots by default");
    expect(prompt).toContain("without adding the product to those shots");
    expect(prompt).toContain("Do NOT include any narration");
    expect(prompt).not.toMatch(/SPOKESPERSON|SPEAKS directly|must talk|spoken lines/i);
  });

  it("preserves the spokesperson instruction without forcing product contact when narration is enabled", () => {
    const prompt = buildSystemPrompt(15, productWithCharacter, false, undefined, undefined, "en", true);

    expect(prompt).toContain("SPOKESPERSON/PRESENTER");
    expect(prompt).toContain("SPEAK directly");
    expect(prompt).toContain("character-only shots");
    expect(prompt).toContain("without the product being visible or held");
    expect(prompt).toContain("Narration:");
  });

  it("requires explicit per-plan shot modes and defaults interaction off", () => {
    const prompt = buildSystemPrompt(30, productWithCharacter, false, undefined, undefined, "en", true, "plan");

    expect(prompt).toContain("[SHOT: PRODUCT_ONLY]");
    expect(prompt).toContain("[SHOT: CHARACTER_ONLY]");
    expect(prompt).toContain("[SHOT: ENVIRONMENT_ONLY]");
    expect(prompt).toContain("[SHOT: INTERACTION]");
    expect(prompt).toContain("allowed only when the user's brief explicitly requires character-product interaction");
    expect(prompt).toContain("Never choose it by default");
    expect(prompt).toContain("no placement beside, against, attached to, touching, or interacting with unrelated structures or objects");
  });
});

describe("scenario-write/index.ts module shape", () => {
  /**
   * The specific failure this guards: an imported binding and a local
   * declaration of the same name. It is invisible to `tsc` here (supabase/ is
   * outside the project) and fatal at module evaluation.
   */
  it("never both imports and declares the same identifier", () => {
    const imported = new Set<string>();
    for (const m of INDEX_SRC.matchAll(/^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gm)) {
      for (const raw of m[1].split(",")) {
        const name = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop()?.trim();
        if (name) imported.add(name);
      }
    }
    expect(imported.size).toBeGreaterThan(0);

    const declared = [
      ...INDEX_SRC.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm),
      ...INDEX_SRC.matchAll(/^\s*(?:export\s+)?(?:const|let|class)\s+(\w+)/gm),
    ].map((m) => m[1]);

    const collisions = declared.filter((name) => imported.has(name));
    expect(collisions, `imported and re-declared in the same module: ${collisions.join(", ")}`)
      .toEqual([]);
  });

  it("takes the prompt builder from prompt.ts and does not re-export it", () => {
    expect(INDEX_SRC).toContain('from "./prompt.ts"');
    expect(INDEX_SRC).not.toMatch(/function\s+buildSystemPrompt/);
    expect(INDEX_SRC).not.toMatch(/export\s*\{[^}]*buildSystemPrompt/);
  });
});
