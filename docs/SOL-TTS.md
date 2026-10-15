# Offline Russian speech · eSpeak NG 1.52.0

Assistent1 ships a separate `sol/tts/espeak-ng.exe` and its rule-based Russian
voice/dictionary. No downloaded neural voice, impersonated speaker, SAPI voice,
Internet connection or manual voice installation is required. The voice is
synthetic and less natural than modern neural speech. Check intelligibility on
your speakers before distribution.

## License and commercial distribution

Upstream: https://github.com/espeak-ng/espeak-ng/tree/1.52.0

Engine, Russian rules and dictionary: **GPL-3.0-or-later** (upstream `COPYING`,
`dictsource/ru_rules` and source headers). GPL permits commercial sale and
redistribution, with its source, copyright and recipient-rights obligations.
This is not a proprietary or royalty-free-without-conditions voice license.
No external MBROLA voices or third-party speaker recordings are used.

The engine runs as an independent executable through its standard text/WAV
pipes. Assistent1 does not link eSpeak into its executable. The installer conveys
the exact unmodified engine source ZIP, all upstream notices, complete build
scripts, dependency source and GPL text under `sol/licenses/tts-source/`.
Recipients may extract, rebuild, modify and replace this independent executable;
the SOL integrity check will reject changed bundled files until the application
is rebuilt with a new manifest. No activation key restricts the TTS engine.
Distributors must retain these materials and GPL rights; do not remove them from
commercial installers. This notice concerns TTS and does not certify the
separate, previously documented Vosk/GCC dependency audit as complete.

Upstream CMake also configures Sonic (Apache-2.0). Its exact source and notices
are supplied as `sonic.zip`; speech-rate acceleration is disabled and it is not
linked to the delivered eSpeak executable. Audio-device output, MBROLA and async
threads are disabled; Assistent1 plays returned WAV through Web Audio.

## Rebuild the exact separate executable

Install CMake 3.31+ and Visual Studio 2022 C++ tools/Windows SDK (build-time only).
Extract `espeak.zip` into `espeak/` and `sonic.zip` into `sonic/`, stripping their
single top-level directory. In that directory run these commands (replace the
absolute Sonic path):

```powershell
Copy-Item espeak/src/include/espeak-ng/speak_lib.h espeak/src/include/espeak/speak_lib.h -Force
cmake -S espeak -B build -A x64 -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_LIBSONIC=OFF -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DFETCHCONTENT_FULLY_DISCONNECTED=ON -DFETCHCONTENT_SOURCE_DIR_SONIC-GIT=C:/absolute/path/to/sonic
cmake --build build --config Release --parallel 2
```

Copy `build/src/Release/espeak-ng.exe` and `build/espeak-ng-data/` into a common
directory. The MSVC runtime is linked statically; no separate redistributable or
SAPI voice installation is needed. All remaining dependencies are Windows APIs.
The source ZIPs are pinned by SHA-256 in `scripts/prepare_tts.py` and the installer
manifest. The complete Assistent1 staging scripts are supplied alongside them.

## Playback and tests

`sol_audio` prefers an installed, valid personal WAV pack; otherwise it runs the
bundled Russian engine with fixed local response text over UTF-8 stdin. It uses
no shell or user-supplied arguments, limits synthesis to 15 seconds/4 MB, and
runs outside the UI thread. Web Audio controls volume independently of the
microphone. Playback gates microphone PCM until the response ends plus 400 ms.
Responses include greeting, starting an action/mode, completion, errors,
cancellation and goodbye. Errors are never announced as successful completion.

The installed-bundle checker synthesizes real Russian text and requires nonzero
PCM samples from the installed executable, as well as loading Vosk and the
Russian model. CI cannot assess human-perceived voice quality, speakers,
microphone permissions or acoustic echo in a real room. Those remain PC tests.
