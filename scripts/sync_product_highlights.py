#!/usr/bin/env python3
"""Sync product_flag and payment methods blocks from product.bundles.json to all product templates."""

import copy
import json
import re
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
BUNDLES_FILE = TEMPLATES_DIR / "product.bundles.json"
FLAG_BLOCK_ID = "product_flag_qn3MLq"
PAYMENT_BLOCK_ID = "custom_liquid_kj8teT"
OLD_FLAG_BLOCK_ID = "product_flag_T9zT3n"
MAIN_SECTION = "main"

MARKET_ALIASES = {
    "denmark": "danmark",
    "norway": "norge",
    "sweden": "svergie",
}


def strip_json_comments(text: str) -> str:
    return re.sub(r"/\*[\s\S]*?\*/", "", text)


def load_json(path: Path) -> dict:
    return json.loads(strip_json_comments(path.read_text(encoding="utf-8")))


def save_json(path: Path, data: dict) -> None:
    original = path.read_text(encoding="utf-8")
    header_match = re.match(r"^/\*[\s\S]*?\*/\s*", original)
    header = header_match.group(0) if header_match else ""
    body = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_text(header + body, encoding="utf-8")


def deep_merge(base: dict, override: dict) -> dict:
    result = copy.deepcopy(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def find_payment_block_ids(blocks: dict) -> list[str]:
    ids = []
    for block_id, block in blocks.items():
        if block.get("type") == "custom_liquid" and block.get("name") == "Payment Methods":
            ids.append(block_id)
        if block.get("type") == "section_vso_theme_sections_payment_icons":
            ids.append(block_id)
    return ids


def fix_block_order(block_order: list[str], payment_ids_to_remove: set[str]) -> list[str]:
    order = [
        bid
        for bid in block_order
        if bid not in {OLD_FLAG_BLOCK_ID, *payment_ids_to_remove}
    ]

    if "buy_buttons" not in order:
        return order

    buy_idx = order.index("buy_buttons")
    insert_at = buy_idx + 1

    if FLAG_BLOCK_ID in order:
        order.remove(FLAG_BLOCK_ID)
    if PAYMENT_BLOCK_ID in order:
        order.remove(PAYMENT_BLOCK_ID)

    order.insert(insert_at, FLAG_BLOCK_ID)
    order.insert(insert_at + 1, PAYMENT_BLOCK_ID)
    return order


def load_bundles_reference() -> tuple[dict, dict]:
    bundles = load_json(BUNDLES_FILE)
    main = bundles["sections"][MAIN_SECTION]
    flag_block = copy.deepcopy(main["blocks"][FLAG_BLOCK_ID])
    payment_block = copy.deepcopy(main["blocks"][PAYMENT_BLOCK_ID])
    return flag_block, payment_block


def load_market_flag_overrides() -> dict[str, dict]:
    overrides: dict[str, dict] = {}
    for path in sorted(TEMPLATES_DIR.glob("product.bundles.context.*.json")):
        data = load_json(path)
        market = data.get("context", {}).get("market")
        if not market:
            continue
        block = (
            data.get("sections", {})
            .get(MAIN_SECTION, {})
            .get("blocks", {})
            .get(FLAG_BLOCK_ID)
        )
        if block:
            overrides[market] = copy.deepcopy(block)
            alias = MARKET_ALIASES.get(market)
            if alias and alias not in overrides:
                overrides[alias] = copy.deepcopy(block)
    return overrides


def process_base_template(path: Path, flag_block: dict, payment_block: dict) -> bool:
    if path.name == BUNDLES_FILE.name:
        return False

    data = load_json(path)
    main = data.get("sections", {}).get(MAIN_SECTION)
    if not main:
        return False

    blocks = main.setdefault("blocks", {})
    changed = False

    if OLD_FLAG_BLOCK_ID in blocks:
        del blocks[OLD_FLAG_BLOCK_ID]
        changed = True

    payment_ids_to_remove = set(find_payment_block_ids(blocks))
    payment_ids_to_remove.discard(PAYMENT_BLOCK_ID)

    for payment_id in payment_ids_to_remove:
        if payment_id in blocks:
            del blocks[payment_id]
            changed = True

    if blocks.get(FLAG_BLOCK_ID) != flag_block:
        blocks[FLAG_BLOCK_ID] = copy.deepcopy(flag_block)
        changed = True

    if blocks.get(PAYMENT_BLOCK_ID) != payment_block:
        blocks[PAYMENT_BLOCK_ID] = copy.deepcopy(payment_block)
        changed = True

    if "block_order" in main:
        new_order = fix_block_order(main["block_order"], payment_ids_to_remove)
        if new_order != main["block_order"]:
            main["block_order"] = new_order
            changed = True

    if changed:
        save_json(path, data)
    return changed


def process_context_template(path: Path, market_overrides: dict[str, dict]) -> bool:
    if "product.bundles.context." in path.name:
        return False

    data = load_json(path)
    market = data.get("context", {}).get("market")
    if not market:
        return False

    flag_override = market_overrides.get(market)
    if not flag_override:
        alias = MARKET_ALIASES.get(market)
        flag_override = market_overrides.get(alias) if alias else None
    if not flag_override:
        print(f"  WARN: No bundles context override for market '{market}' in {path.name}")
        return False

    main = data.get("sections", {}).get(MAIN_SECTION)
    if not main:
        return False

    blocks = main.setdefault("blocks", {})
    changed = False

    if OLD_FLAG_BLOCK_ID in blocks:
        if FLAG_BLOCK_ID not in blocks:
            blocks[FLAG_BLOCK_ID] = copy.deepcopy(flag_override)
        else:
            blocks[FLAG_BLOCK_ID] = deep_merge(blocks[FLAG_BLOCK_ID], flag_override)
        del blocks[OLD_FLAG_BLOCK_ID]
        changed = True
    elif FLAG_BLOCK_ID in blocks:
        merged = deep_merge(blocks[FLAG_BLOCK_ID], flag_override)
        if merged != blocks[FLAG_BLOCK_ID]:
            blocks[FLAG_BLOCK_ID] = merged
            changed = True
    else:
        blocks[FLAG_BLOCK_ID] = copy.deepcopy(flag_override)
        changed = True

    if "block_order" in main:
        payment_ids_to_remove = set(find_payment_block_ids(blocks))
        payment_ids_to_remove.discard(PAYMENT_BLOCK_ID)
        new_order = fix_block_order(main["block_order"], payment_ids_to_remove)
        if new_order != main["block_order"]:
            main["block_order"] = new_order
            changed = True

    if changed:
        save_json(path, data)
    return changed


def main() -> None:
    flag_block, payment_block = load_bundles_reference()
    market_overrides = load_market_flag_overrides()

    base_changed = []
    for path in sorted(TEMPLATES_DIR.glob("product*.json")):
        if ".context." in path.name:
            continue
        if process_base_template(path, flag_block, payment_block):
            base_changed.append(path.name)

    context_changed = []
    for path in sorted(TEMPLATES_DIR.glob("product*.context.*.json")):
        if process_context_template(path, market_overrides):
            context_changed.append(path.name)

    print(f"Updated {len(base_changed)} base templates:")
    for name in base_changed:
        print(f"  - {name}")
    print(f"Updated {len(context_changed)} context templates:")
    for name in context_changed:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
