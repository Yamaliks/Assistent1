# SOL third-party component notices — test distribution

The versioned runtime is from the official Vosk API v0.3.45 Windows x64 archive, pinned at SHA-256 f1dcc9cca460630f81ea8f71794f69c80bed6556d2a4e6237b5785e1d2dff34b (14,882,445 bytes). Its four DLLs are bundled unchanged. Windows system DLLs (`KERNEL32.dll`, `msvcrt.dll`) are not copied from a developer machine. Microsoft WebView2 is included through Tauri's official offline-installer mode; Microsoft's redistribution terms apply.

| Component | Source / license evidence | Included notice |
| --- | --- | --- |
| Vosk API 0.3.45 | https://github.com/alphacep/vosk-api/blob/v0.3.45/COPYING — Apache-2.0 | VOSK-APACHE-2.0.txt |
| small-ru-0.22 model | https://alphacephei.com/vosk/models — exact model row must state Apache-2.0 before CI stages the archive | MODEL-NOTICE.txt and saved official catalog in generated bundle |
| libgcc_s_seh-1.dll / libstdc++-6.dll | GCC runtime: GPL-3.0 with GCC Runtime Library Exception 3.1 | GCC-GPL-3.0.txt / GCC-RUNTIME-EXCEPTION-3.1.txt |
| libwinpthread-1.dll | https://github.com/mingw-w64/mingw-w64/blob/v8.0.0/mingw-w64-libraries/winpthreads/COPYING — MIT-style notice, additional source notices below | WINPTHREADS-8.0.0.txt |
| Kaldi | https://github.com/alphacep/kaldi/blob/vosk-android/COPYING — Apache-2.0 | KALDI-APACHE-2.0.txt |
| OpenFst | https://github.com/alphacep/openfst/blob/master/COPYING — Apache-2.0 | OPENFST-APACHE-2.0.txt |
| OpenBLAS 0.3.20 | https://github.com/xianyi/OpenBLAS/blob/v0.3.20/LICENSE — BSD-style | OPENBLAS-0.3.20.txt |
| CLAPACK 3.2.1 | https://github.com/alphacep/clapack/blob/v3.2.1/COPYING — permissive LAPACK notice | CLAPACK-3.2.1.txt |

Vosk's published Windows build recipe is https://github.com/alphacep/vosk-api/blob/v0.3.45/travis/Dockerfile.win. It uses Debian 11's MinGW/GCC, OpenFst/Kaldi branches, OpenBLAS 0.3.20 and CLAPACK 3.2.1. The winpthread binary contains a mingw-w64-8.0.0 build path and GCC 10 version strings, consistent with that recipe. This is supporting evidence, not a complete reproducible binary provenance audit: the recipe does not pin every source commit or distro package, and the ZIP contains no complete SBOM/source bundle. Full source trees and notices are available from the linked upstream projects (including https://gcc.gnu.org/releases.html and https://www.mingw-w64.org/); no claim that source links alone satisfy every possible redistribution obligation is made.

**Commercial release audit is incomplete.** Verify the exact GCC/distro source versions and any applicable source-conveyance/exception obligations, winpthread per-source notices, statically linked libraries' notices (including libf2c/CLAPACK), model notices, and Microsoft's WebView2 terms before selling a distribution. This build is for functional testing, not a declaration that every commercial legal obligation has been discharged. The generated manifest deliberately records `commercialAuditComplete: false`. No recordings, sample voice or third-party speaking identity are bundled. User-created audio requires the author's permission for the intended use.

The full texts shipped next to this notice are copied from upstream; this inventory does not replace those licenses. Preserve copyright notices and the Apache license/patent conditions. No third-party endorsement is implied.
