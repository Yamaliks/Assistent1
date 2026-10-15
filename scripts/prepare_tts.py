#!/usr/bin/env python3
"""Build an independent GPL-3.0-or-later eSpeak NG executable; convey its source."""
import os
from pathlib import Path
import shutil
import subprocess
from prepare_sol import download, check_archive, extract, ROOT

ESPEAK = {"name": "espeak-ng-1.52.0", "url": "https://codeload.github.com/espeak-ng/espeak-ng/zip/refs/tags/1.52.0", "sha256": "b4517592e3cbc43703bb1c782702eafb98097659e0b7e96e69c32ee32ae5003a", "minBytes": 19_257_724, "maxBytes": 19_257_724}
SONIC = {"name": "sonic-fbf75c3d6d846bad3bb3d456cbc5d07d9fd8c104", "url": "https://codeload.github.com/waywardgeek/sonic/zip/fbf75c3d6d846bad3bb3d456cbc5d07d9fd8c104", "sha256": "d7c5a715f574a4a2a5afe970f489d3950bcd5229f1bed3f0e010a5413957ec20", "minBytes": 5_343_518, "maxBytes": 5_343_518}

def prepare_tts(work, stage):
    sources = stage / "licenses/tts-source"
    sources.mkdir(parents=True)
    for spec, target in [(ESPEAK, "espeak"), (SONIC, "sonic")]:
        archive = sources / (target + ".zip")
        download(spec["url"], archive, spec["maxBytes"])
        check_archive(archive, spec)
        links = {"espeak-ng-1.52.0/src/include/espeak/speak_lib.h": ("../espeak-ng/speak_lib.h", "espeak-ng-1.52.0/src/include/espeak-ng/speak_lib.h")} if spec == ESPEAK else None
        extract(archive, spec, work / target, links)
    source, build = work / "espeak", work / "tts-build"
    configure = ["cmake", "-S", str(source), "-B", str(build),
        "-DBUILD_SHARED_LIBS=OFF", "-DBUILD_TESTING=OFF", "-DUSE_ASYNC=OFF",
        "-DUSE_MBROLA=OFF", "-DUSE_LIBPCAUDIO=OFF", "-DUSE_LIBSONIC=OFF",
        "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_POLICY_DEFAULT_CMP0091=NEW",
        "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
        "-DFETCHCONTENT_FULLY_DISCONNECTED=ON",
        f"-DFETCHCONTENT_SOURCE_DIR_SONIC-GIT={work / 'sonic'}"]
    if os.name == "nt":
        configure += ["-A", "x64"]
    subprocess.run(configure, check=True)
    subprocess.run(["cmake", "--build", str(build), "--config", "Release", "--target", "espeak-ng-bin", "data", "--parallel", "2"], check=True)
    target = stage / "tts"
    target.mkdir()
    executable = build / ("src/Release/espeak-ng.exe" if os.name == "nt" else "src/espeak-ng")
    shutil.copyfile(executable, target / executable.name)
    (target / executable.name).chmod(0o755)
    shutil.copytree(build / "espeak-ng-data", target / "espeak-ng-data")
    shutil.copyfile(source / "COPYING", sources / "COPYING-GPL-3.0.txt")
    shutil.copyfile(ROOT / "scripts/prepare_tts.py", sources / "prepare_tts.py")
    shutil.copyfile(ROOT / "scripts/prepare_sol.py", sources / "prepare_sol.py")
    shutil.copyfile(ROOT / "docs/SOL-TTS.md", sources / "BUILD-AND-LICENSE.md")
    # The exact unmodified source archives, notices and build instructions travel
    # inside the installer, not just a potentially expiring external source offer.
    return {"name": ESPEAK["name"], "source": ESPEAK["url"], "sha256": ESPEAK["sha256"], "bytes": ESPEAK["maxBytes"], "license": "GPL-3.0-or-later", "sonicSourceSha256": SONIC["sha256"]}
