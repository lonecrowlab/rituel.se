const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const BUNDLES_FILE = path.join(TEMPLATES_DIR, "product.bundles.json");
const FLAG_BLOCK_ID = "product_flag_qn3MLq";
const PAYMENT_BLOCK_ID = "custom_liquid_kj8teT";
const OLD_FLAG_BLOCK_ID = "product_flag_T9zT3n";
const MAIN_SECTION = "main";

const MARKET_ALIASES = {
  denmark: "danmark",
  norway: "norge",
  sweden: "svergie",
};

const NORDIC_FLAG_SVGS = {
  danmark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 370 280" width="370" height="280">\n  <rect width="370" height="280" fill="#C8102E"></rect>\n  <rect x="120" width="40" height="280" fill="#FFFFFF"></rect>\n  <rect y="120" width="370" height="40" fill="#FFFFFF"></rect>\n</svg>',
  denmark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 370 280" width="370" height="280">\n  <rect width="370" height="280" fill="#C8102E"></rect>\n  <rect x="120" width="40" height="280" fill="#FFFFFF"></rect>\n  <rect y="120" width="370" height="40" fill="#FFFFFF"></rect>\n</svg>',
  norge:
    '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 220 160" width="220" height="160">\n  <rect width="220" height="160" fill="#BA0C2F"></rect>\n  <rect x="50" width="40" height="160" fill="#FFFFFF"></rect>\n  <rect y="60" width="220" height="40" fill="#FFFFFF"></rect>\n  <rect x="60" width="20" height="160" fill="#00205B"></rect>\n  <rect y="70" width="220" height="20" fill="#00205B"></rect>\n</svg>',
  norway:
    '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 220 160" width="220" height="160">\n  <rect width="220" height="160" fill="#BA0C2F"></rect>\n  <rect x="50" width="40" height="160" fill="#FFFFFF"></rect>\n  <rect y="60" width="220" height="40" fill="#FFFFFF"></rect>\n  <rect x="60" width="20" height="160" fill="#00205B"></rect>\n  <rect y="70" width="220" height="20" fill="#00205B"></rect>\n</svg>',
};

const NORDIC_MARKETS = Object.keys(NORDIC_FLAG_SVGS);

const AUTO_HEADER = `/*
 * ------------------------------------------------------------
 * IMPORTANT: The contents of this file are auto-generated.
 *
 * This file may be updated by the Shopify admin theme editor
 * or related systems. Please exercise caution as any changes
 * made to this file may be overwritten.
 * ------------------------------------------------------------
 */
`;

function getNordicFlagSvg(market) {
  if (NORDIC_FLAG_SVGS[market]) return NORDIC_FLAG_SVGS[market];
  const alias = MARKET_ALIASES[market];
  return alias ? NORDIC_FLAG_SVGS[alias] : undefined;
}

function isNordicMarket(market) {
  return Boolean(getNordicFlagSvg(market));
}

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function loadJson(filePath) {
  return JSON.parse(stripJsonComments(fs.readFileSync(filePath, "utf8")));
}

function saveJson(filePath, data) {
  const isNew = !fs.existsSync(filePath);
  const original = isNew ? AUTO_HEADER : fs.readFileSync(filePath, "utf8");
  const headerMatch = original.match(/^\/\*[\s\S]*?\*\/\s*/);
  const header = headerMatch ? headerMatch[0] : AUTO_HEADER;
  fs.writeFileSync(filePath, header + JSON.stringify(data, null, 2) + "\n", "utf8");
}

function deepMerge(base, override) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (
      Object.prototype.hasOwnProperty.call(result, key) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}

function findPaymentBlockIds(blocks) {
  const ids = [];
  for (const [blockId, block] of Object.entries(blocks)) {
    if (block.type === "custom_liquid" && block.name === "Payment Methods") {
      ids.push(blockId);
    }
    if (
      block.type === "section_vso_theme_sections_payment_icons" ||
      (typeof block.type === "string" && block.type.includes("paymentIcons")) ||
      (blockId.includes("payment_icons") && blockId !== PAYMENT_BLOCK_ID)
    ) {
      ids.push(blockId);
    }
  }
  return ids;
}

function cleanBlockOrder(blockOrder, blocks) {
  return blockOrder.filter((id) => Object.prototype.hasOwnProperty.call(blocks, id));
}

function fixBlockOrder(blockOrder, paymentIdsToRemove) {
  const remove = new Set([OLD_FLAG_BLOCK_ID, ...paymentIdsToRemove]);
  const order = blockOrder.filter((id) => !remove.has(id));

  if (!order.includes("buy_buttons")) {
    return order;
  }

  const buyIdx = order.indexOf("buy_buttons");
  const insertAt = buyIdx + 1;

  const flagIdx = order.indexOf(FLAG_BLOCK_ID);
  if (flagIdx !== -1) order.splice(flagIdx, 1);
  const paymentIdx = order.indexOf(PAYMENT_BLOCK_ID);
  if (paymentIdx !== -1) order.splice(paymentIdx, 1);

  order.splice(insertAt, 0, FLAG_BLOCK_ID, PAYMENT_BLOCK_ID);
  return order;
}

function loadBundlesReference() {
  const bundles = loadJson(BUNDLES_FILE);
  const main = bundles.sections[MAIN_SECTION];
  return {
    flagBlock: structuredClone(main.blocks[FLAG_BLOCK_ID]),
    paymentBlock: structuredClone(main.blocks[PAYMENT_BLOCK_ID]),
  };
}

function loadMarketFlagOverrides() {
  const overrides = {};
  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((name) => name.startsWith("product.bundles.context.") && name.endsWith(".json"))
    .sort();

  for (const name of files) {
    const data = loadJson(path.join(TEMPLATES_DIR, name));
    const market = data.context?.market;
    if (!market) continue;

    const block = data.sections?.[MAIN_SECTION]?.blocks?.[FLAG_BLOCK_ID];
    if (!block) continue;

    overrides[market] = structuredClone(block);
    const alias = MARKET_ALIASES[market];
    if (alias && !overrides[alias]) {
      overrides[alias] = structuredClone(block);
    }
  }

  for (const market of NORDIC_MARKETS) {
    overrides[market] = {
      disabled: false,
      settings: {
        icon_1_svg: NORDIC_FLAG_SVGS[market],
      },
    };
  }

  return overrides;
}

function processBaseTemplate(filePath, flagBlock, paymentBlock) {
  if (path.basename(filePath) === path.basename(BUNDLES_FILE)) {
    return false;
  }

  const data = loadJson(filePath);
  const main = data.sections?.[MAIN_SECTION];
  if (!main) return false;

  const blocks = main.blocks || (main.blocks = {});
  let changed = false;

  if (blocks[OLD_FLAG_BLOCK_ID]) {
    delete blocks[OLD_FLAG_BLOCK_ID];
    changed = true;
  }

  const paymentIdsToRemove = new Set(findPaymentBlockIds(blocks));
  paymentIdsToRemove.delete(PAYMENT_BLOCK_ID);

  for (const paymentId of paymentIdsToRemove) {
    if (blocks[paymentId]) {
      delete blocks[paymentId];
      changed = true;
    }
  }

  if (JSON.stringify(blocks[FLAG_BLOCK_ID]) !== JSON.stringify(flagBlock)) {
    blocks[FLAG_BLOCK_ID] = structuredClone(flagBlock);
    changed = true;
  }

  if (JSON.stringify(blocks[PAYMENT_BLOCK_ID]) !== JSON.stringify(paymentBlock)) {
    blocks[PAYMENT_BLOCK_ID] = structuredClone(paymentBlock);
    changed = true;
  }

  if (main.block_order) {
    const newOrder = fixBlockOrder(cleanBlockOrder(main.block_order, blocks), paymentIdsToRemove);
    if (JSON.stringify(newOrder) !== JSON.stringify(main.block_order)) {
      main.block_order = newOrder;
      changed = true;
    }
  }

  if (changed) saveJson(filePath, data);
  return changed;
}

function processContextTemplate(filePath, marketOverrides) {
  if (path.basename(filePath).includes("product.bundles.context.")) {
    return false;
  }

  const data = loadJson(filePath);
  const market = data.context?.market;
  if (!market) return false;

  const main = data.sections?.[MAIN_SECTION];
  if (!main) return false;

  const blocks = main.blocks || (main.blocks = {});
  let changed = false;

  if (isNordicMarket(market)) {
    const contextData = { sections: { [MAIN_SECTION]: main }, context: { market } };
    if (applyNordicFlagToContextData(contextData, market)) {
      changed = true;
    }
  } else {
    let flagOverride = marketOverrides[market];
    if (!flagOverride) {
      const alias = MARKET_ALIASES[market];
      flagOverride = alias ? marketOverrides[alias] : undefined;
    }
    if (!flagOverride) {
      console.log(`  WARN: No bundles context override for market '${market}' in ${path.basename(filePath)}`);
      return false;
    }

    if (blocks[OLD_FLAG_BLOCK_ID]) {
      blocks[FLAG_BLOCK_ID] = blocks[FLAG_BLOCK_ID]
        ? deepMerge(blocks[FLAG_BLOCK_ID], flagOverride)
        : structuredClone(flagOverride);
      delete blocks[OLD_FLAG_BLOCK_ID];
      changed = true;
    } else if (blocks[FLAG_BLOCK_ID]) {
      const merged = deepMerge(blocks[FLAG_BLOCK_ID], flagOverride);
      if (JSON.stringify(merged) !== JSON.stringify(blocks[FLAG_BLOCK_ID])) {
        blocks[FLAG_BLOCK_ID] = merged;
        changed = true;
      }
    } else {
      blocks[FLAG_BLOCK_ID] = structuredClone(flagOverride);
      changed = true;
    }
  }

  if (main.block_order) {
    const paymentIdsToRemove = new Set(findPaymentBlockIds(blocks));
    paymentIdsToRemove.delete(PAYMENT_BLOCK_ID);
    const newOrder = fixBlockOrder(cleanBlockOrder(main.block_order, blocks), paymentIdsToRemove);
    if (JSON.stringify(newOrder) !== JSON.stringify(main.block_order)) {
      main.block_order = newOrder;
      changed = true;
    }
  }

  if (changed) saveJson(filePath, data);
  return changed;
}

function getContextFilePath(baseName, market) {
  const stem = baseName.replace(/\.json$/, "");
  return path.join(TEMPLATES_DIR, `${stem}.context.${market}.json`);
}

function applyNordicFlagToContextData(contextData, market) {
  const svg = getNordicFlagSvg(market);
  if (!svg) return false;

  const main = contextData.sections?.[MAIN_SECTION] || (contextData.sections = {})[MAIN_SECTION] || {};
  main.settings = main.settings || {};
  const blocks = main.blocks || (main.blocks = {});
  const flagBlock = blocks[FLAG_BLOCK_ID] || { disabled: false, settings: {} };

  flagBlock.disabled = false;
  flagBlock.settings = flagBlock.settings || {};
  if (flagBlock.settings.icon_1_svg === svg) {
    blocks[FLAG_BLOCK_ID] = flagBlock;
    return false;
  }

  flagBlock.settings.icon_1_svg = svg;
  blocks[FLAG_BLOCK_ID] = flagBlock;
  return true;
}

function syncNordicFlagContexts(baseName) {
  const basePath = path.join(TEMPLATES_DIR, baseName);
  const baseData = loadJson(basePath);
  if (!baseData.sections?.[MAIN_SECTION]?.blocks?.[FLAG_BLOCK_ID]) {
    return [];
  }

  const changed = [];
  for (const market of NORDIC_MARKETS) {
    const contextPath = getContextFilePath(baseName, market);
    let contextData;

    if (fs.existsSync(contextPath)) {
      contextData = loadJson(contextPath);
    } else {
      contextData = {
        context: { market },
        parent: baseName,
        sections: {
          [MAIN_SECTION]: {
            settings: {},
            blocks: {},
          },
        },
      };
    }

    contextData.context = contextData.context || {};
    contextData.context.market = market;
    contextData.parent = baseName;

    if (applyNordicFlagToContextData(contextData, market)) {
      saveJson(contextPath, contextData);
      changed.push(path.basename(contextPath));
    }
  }

  return changed;
}

function main() {
  const { flagBlock, paymentBlock } = loadBundlesReference();
  const marketOverrides = loadMarketFlagOverrides();

  const baseChanged = [];
  for (const name of fs.readdirSync(TEMPLATES_DIR).sort()) {
    if (!name.startsWith("product") || !name.endsWith(".json") || name.includes(".context.")) {
      continue;
    }
    const filePath = path.join(TEMPLATES_DIR, name);
    if (processBaseTemplate(filePath, flagBlock, paymentBlock)) {
      baseChanged.push(name);
    }
  }

  const contextChanged = [];
  for (const name of fs.readdirSync(TEMPLATES_DIR).sort()) {
    if (!name.startsWith("product") || !name.includes(".context.") || !name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(TEMPLATES_DIR, name);
    if (processContextTemplate(filePath, marketOverrides)) {
      contextChanged.push(name);
    }
  }

  const nordicChanged = [];
  for (const name of fs.readdirSync(TEMPLATES_DIR).sort()) {
    if (!name.startsWith("product") || !name.endsWith(".json") || name.includes(".context.")) {
      continue;
    }
    nordicChanged.push(...syncNordicFlagContexts(name));
  }

  console.log(`Updated ${baseChanged.length} base templates:`);
  baseChanged.forEach((name) => console.log(`  - ${name}`));
  console.log(`Updated ${contextChanged.length} context templates:`);
  contextChanged.forEach((name) => console.log(`  - ${name}`));
  console.log(`Ensured Nordic flags on ${nordicChanged.length} market contexts:`);
  nordicChanged.forEach((name) => console.log(`  - ${name}`));
}

main();
