#!/usr/bin/env python3
"""Stage pinned SOL resources for Tauri; no archives/binaries enter Git history."""
import argparse
import hashlib
import html
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import urllib.request
from urllib.parse import urlparse
import zipfile
import wave

ROOT = Path(__file__).resolve().parents[1]
MODEL = {"name": "vosk-model-small-ru-0.22", "url": "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip", "sha256": "961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4", "minBytes": 40_000_000, "maxBytes": 55_000_000}
RUNTIME = {"name": "vosk-win64-0.3.45", "url": "https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-win64-0.3.45.zip", "sha256": "f1dcc9cca460630f81ea8f71794f69c80bed6556d2a4e6237b5785e1d2dff34b", "minBytes": 14_882_445, "maxBytes": 14_882_445}
CATALOG = "https://alphacephei.com/vosk/models"
DLLS = ["libvosk.dll", "libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll"]
MODEL_FILES = ["am/final.mdl", "conf/mfcc.conf", "conf/model.conf", "graph/HCLr.fst", "graph/Gr.fst", "graph/phones/word_boundary.int"]

def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def check_archive(path, spec):
    size = path.stat().st_size
    if not spec["minBytes"] <= size <= spec["maxBytes"]:
        raise ValueError(f"{spec['name']}: invalid archive size {size}")
    if digest(path) != spec["sha256"]:
        raise ValueError(f"{spec['name']}: SHA-256 mismatch")
    return size

def download(url, path, limit):
    request = urllib.request.Request(url, headers={"User-Agent": "Assistent1-SOL-build", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(request, timeout=90) as response, path.open("wb") as output:
        if urlparse(response.url).scheme != "https" or urlparse(response.url).hostname not in {"alphacephei.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}:
            raise ValueError("HTTPS required")
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > limit:
            raise ValueError("Download exceeds size bound")
        count = 0
        while chunk := response.read(65536):
            count += len(chunk)
            if count > limit:
                raise ValueError("Download exceeds size bound")
            output.write(chunk)
        if declared and count != int(declared):
            raise ValueError("Download length does not match HTTP Content-Length")

def model_license(catalog):
    for row in re.findall(r"<tr\b[^>]*>.*?</tr>", catalog, flags=re.S | re.I):
        if re.search(r'href=["\'](?:[^"\']*/)?vosk-model-small-ru-0\.22\.zip["\']', row):
            text = html.unescape(re.sub(r"<[^>]+>", " ", row))
            text = re.sub(r"\s+", " ", text).strip()
            if re.search(r"\bApache\s*(?:License\s*)?2(?:\.0)?\b", text, re.I):
                return text
            raise ValueError("Selected model catalog row does not declare Apache-2.0")
    raise ValueError("Official catalog does not identify the exact Russian model/license")

def extract(path, spec, destination):
    total = 0
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > 5000:
            raise ValueError("Too many ZIP entries")
        for item in archive.infolist():
            part = PurePosixPath(item.filename)
            if part.is_absolute() or not part.parts or part.parts[0] != spec["name"] or ".." in part.parts or "\\" in item.filename or ":" in item.filename or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Unsafe archive path/link")
            if any(p.endswith((".", " ")) or re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", p) for p in part.parts):
                raise ValueError("Windows device path in archive")
            total += item.file_size
            if total > 250_000_000:
                raise ValueError("Extracted archive exceeds 250 MB")
            target = destination.joinpath(*part.parts[1:])
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive create also catches duplicate/case-colliding entries on Windows.
            with archive.open(item) as source, target.open("xb") as output:
                count = 0
                while chunk := source.read(65536):
                    count += len(chunk)
                    if count > item.file_size:
                        raise ValueError("Uncompressed size mismatch")
                    output.write(chunk)
                if count != item.file_size:
                    raise ValueError("Incomplete ZIP entry")

def inventory(root):
    return [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size, "sha256": digest(p)} for p in sorted(root.rglob("*")) if p.is_file() and p.name != "bundle-manifest.json"]

def add_audio(source, stage):
    """Optional developer-supplied, reviewed recordings. Never synthesize placeholders."""
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if not manifest.get("author") or not manifest.get("license") or manifest.get("commercialUseApproved") is not True:
        raise ValueError("Reviewed audio author/license/commercialUseApproved metadata required")
    target = stage / "audio"
    target.mkdir()
    for name in ["hello", "listening", "opening", "mode", "done", "errors", "unknown", "cancelled", "goodbye"]:
        path = source / (name + ".wav")
        if path.stat().st_size > 4_000_000:
            raise ValueError("Audio recording exceeds 4 MB")
        with wave.open(str(path)) as record:
            if record.getsampwidth() != 2 or record.getnchannels() not in [1, 2] or not 8000 <= record.getframerate() <= 48000 or not 0 < record.getnframes() <= record.getframerate() * 15:
                raise ValueError("Expected real short PCM16 WAV recording")
        shutil.copyfile(path, target / path.name)
    shutil.copyfile(source / "manifest.json", target / "manifest.json")
    if (source / "LICENSE.txt").is_file():
        shutil.copyfile(source / "LICENSE.txt", target / "LICENSE.txt")

def prepare(output, runtime=None, model=None, catalog_file=None, audio=None):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sol-staging-", dir=output.parent) as temp:
        work = Path(temp)
        catalog = work / "model-catalog.html"
        if catalog_file:
            shutil.copyfile(catalog_file, catalog)
        else:
            download(CATALOG, catalog, 2_000_000)
        license_row = model_license(catalog.read_text(encoding="utf-8"))
        stage = work / "sol"
        stage.mkdir()
        provenance = {}
        for kind, spec, local in [("runtime", RUNTIME, runtime), ("model", MODEL, model)]:
            archive = Path(local) if local else work / (kind + ".zip")
            if not local:
                download(spec["url"], archive, spec["maxBytes"])
            size = check_archive(archive, spec)
            extract(archive, spec, stage / kind)
            provenance[kind] = {"name": spec["name"], "source": spec["url"], "sha256": spec["sha256"], "bytes": size}
        for file in DLLS:
            if not (stage / "runtime" / file).is_file():
                raise ValueError(f"Missing runtime DLL: {file}")
        for file in MODEL_FILES:
            if not (stage / "model" / file).is_file():
                raise ValueError(f"Missing model component: {file}")
        shutil.copytree(ROOT / "docs" / "licenses", stage / "licenses")
        shutil.copyfile(ROOT / "docs" / "SOL-THIRD-PARTY.md", stage / "licenses" / "SOL-THIRD-PARTY.md")
        shutil.copyfile(catalog, stage / "licenses" / "model-catalog.html")
        (stage / "licenses" / "MODEL-NOTICE.txt").write_text(f"Source: {CATALOG}\nOfficial catalog declaration: {license_row}\nArchive SHA256: {MODEL['sha256']}\nCatalog SHA256: {digest(catalog)}\nLicense: Apache-2.0 (see VOSK-APACHE-2.0.txt).\n", encoding="utf-8")
        if audio:
            add_audio(Path(audio), stage)
        (stage / "bundle-manifest.json").write_text(json.dumps({"schema": 1, "archives": provenance, "commercialAuditComplete": False, "files": inventory(stage)}, indent=2) + "\n", encoding="utf-8")
        # No partial installation when download/check/license verification fails.
        backup = output.with_name(output.name + ".previous")
        if backup.exists():
            raise ValueError(f"Preserving previous recovery directory: {backup}")
        if output.exists():
            output.rename(backup)
        try:
            shutil.move(str(stage), str(output))
        except Exception:
            if backup.exists():
                backup.rename(output)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    print(f"Verified SOL resources staged: {output}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "src-tauri/resources/sol")
    parser.add_argument("--runtime-archive", type=Path)
    parser.add_argument("--model-archive", type=Path)
    parser.add_argument("--catalog", type=Path, help="Previously saved official catalog (offline developer builds)")
    parser.add_argument("--audio-directory", type=Path, help="Reviewed optional authored WAV recordings (not required for recognition)")
    args = parser.parse_args()
    prepare(args.output.resolve(), args.runtime_archive, args.model_archive, args.catalog, args.audio_directory)
