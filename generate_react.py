import json
import os
from pathlib import Path
from pathlib import PurePosixPath

import requests

API_URL = "https://ollama.com/api/chat"
MODEL = "gemma4:31b-cloud"

api_key = os.environ.get("OLLAMA_API_KEY")
if not api_key:
    raise SystemExit(
        "Missing OLLAMA_API_KEY. Set it in PowerShell before running this script."
    )

prompt = input("What do you want to build?\n> ").strip()
if not prompt:
    raise SystemExit("Please enter a description of the app to build.")

try:
    response = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": """
Return ONLY React JSX code.

No explanations.

Generate a complete, usable React front-end demo for the user's request as
multiple source files. Return one valid JSON object with this exact shape:
{"files":{"src/App.jsx":"complete file contents","src/components/Example.jsx":"complete file contents"}}
Include at least three files, including src/App.jsx and at least two separate
modules imported and used by App.jsx. Escape file contents as valid JSON strings.
Do not include markdown fences or text outside the JSON object.

For a shopping cart or online store, build a polished, cohesive storefront with
sample products, reusable product cards and product listing, search/category
filtering, add-to-cart actions, a cart drawer or page, quantity controls, item
removal, subtotal/total, and a useful empty-cart state. Persist the cart using
localStorage. Include a clearly labeled demo checkout only; do not claim to
process real payments or connect to a real inventory/backend.

Use React and browser APIs only; do not import third-party packages or icon
libraries. Use text or inline SVG icons. Use Tailwind CSS v4 utility classes,
which are configured globally. Keep every generated file under src/. Do not
generate or overwrite package.json, vite.config.js, or src/main.jsx. The existing
src/main.jsx imports src/App.jsx and src/index.css.
""",
                },
                {"role": "user", "content": prompt},
            ],
            "format": "json",
            "stream": False,
        },
        timeout=180,
    )
except requests.RequestException as exc:
    raise SystemExit(f"Could not reach Ollama Cloud: {exc}") from exc

try:
    result = response.json()
except ValueError as exc:
    raise SystemExit(
        f"Ollama returned a non-JSON response (HTTP {response.status_code})."
    ) from exc

if not response.ok:
    detail = result.get("error") if isinstance(result, dict) else None
    message = f": {detail}" if isinstance(detail, str) else ""
    raise SystemExit(f"Ollama API error (HTTP {response.status_code}){message}")

if not isinstance(result, dict):
    raise SystemExit("Ollama returned an unexpected response format.")

reply = result.get("message")
content = reply.get("content") if isinstance(reply, dict) else None
if not isinstance(content, str) or not content.strip():
    detail = result.get("error")
    if isinstance(detail, str):
        raise SystemExit(f"Ollama API error: {detail}")
    raise SystemExit("Ollama's response did not contain generated files.")

try:
    generated = json.loads(content)
except json.JSONDecodeError as exc:
    raise SystemExit(
        "Ollama did not return valid JSON for the generated files."
    ) from exc

files = generated.get("files") if isinstance(generated, dict) else None
if not isinstance(files, dict) or len(files) < 3:
    raise SystemExit(
        "Ollama must return at least three files in a JSON 'files' object."
    )
if "src/App.jsx" not in files:
    raise SystemExit("Ollama's generated files must include src/App.jsx.")

project_root = Path(__file__).resolve().parent / "ai-react-builder"
source_root = project_root / "src"
allowed_extensions = {".css", ".js", ".json", ".jsx", ".svg"}
validated_files: list[tuple[Path, str]] = []

for relative_name, file_content in files.items():
    if not isinstance(relative_name, str) or not isinstance(file_content, str):
        raise SystemExit("Generated file paths and contents must be strings.")

    relative_path = PurePosixPath(relative_name)
    if (
        "\\" in relative_name
        or relative_path.is_absolute()
        or ".." in relative_path.parts
        or not relative_path.parts
        or relative_path.parts[0] != "src"
        or relative_path.suffix.lower() not in allowed_extensions
        or any(
            any(character in '<>:"|?*' for character in part)
            or part.endswith((" ", "."))
            for part in relative_path.parts
        )
    ):
        raise SystemExit(
            f"Rejected generated path {relative_name!r}; files must be "
            "supported source files under src/."
        )

    output_path = project_root.joinpath(*relative_path.parts)
    try:
        output_path.resolve().relative_to(source_root.resolve())
    except ValueError as exc:
        raise SystemExit(
            f"Rejected generated path {relative_name!r}; files must stay under src/."
        ) from exc
    validated_files.append((output_path, file_content))

for output_path, file_content in validated_files:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(file_content, encoding="utf-8")

print(f"Generated {len(validated_files)} files:")
for output_path, _ in validated_files:
    print(f"- {output_path}")
