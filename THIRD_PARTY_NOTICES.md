# Third-party notices

No Game Boy/Game Boy Color ROM, user save, IPA, third-party mod, or private test fixture is included.

## External mods

The suite can import user-selected Gen1Recomp mod ZIPs and can explicitly download the release asset from `scottcandy34/DramaticShapeVoxelMod-latest`. Those executable files remain external and are not copied into this project or deliverable. The repository states restrictions on redistribution of later Dramatic Shape code; direct, user-confirmed, digest-verified download is used instead. A mod’s own license/notices govern the user’s local copy.

## Wilds of Kanto source-compatibility anchor

- Project: <https://github.com/YoDrehDenSwagAuf/overworld-spawn-mod>
- Exact regression release: `v1.12.2`
- Release SHA-256: `7272a62c7d72f069295281835c0a6cdbaccd2bcf0c24b2b8284c90b9d68a8e3b`
- Source license: MIT
- Retained license: `references/LICENSE-Wilds-of-Kanto.md`

The suite does not bundle Wilds, its release archive, or its art. The browser-engine patcher contains only a narrow source-anchor string and replacement needed to add an ImageData format capability check at the exact in-memory compile path. The installed/public mod remains byte-identical and keeps its own fallback behavior. Upstream third-party art is not copied or redistributed.

## Gen1Recomp v0.1.78

- Project: <https://github.com/bryanthaboi/gen1recomp>
- Official release asset used to produce the patched runtime: `gen1recomp-0.1.78.love`
- Official asset SHA-256: `4dfd6e78808024eda0cce8b9fa5434a5846d1aa327912f7a1ce3c888e416c4fe`
- License: MIT
- Retained license: `references/LICENSE-Gen1Recomp.md`

The bundled `.love` is altered for browser compatibility. Patch source and a deterministic builder are included at `runtime/patches/bit.lua` and `tools/build_web_love.py`; changes are enumerated in `ARCHITECTURE.md`.

## Davidobot/love.js

- Project: <https://github.com/Davidobot/love.js>
- Commit: `c4f04e185033a7c9fbefa9be3bec88c41a90421b`
- Runtime variant: LÖVE 11.5 compatibility/no-pthreads build
- License: MIT
- Retained license: `runtime/LICENSE-love.js.txt`

The bundled `love.js` adds `Module.FS = FS` so the same-origin host shell can explicitly synchronize IDBFS and mirror allowlisted save files. The bundled `game-loader.template.js` is derived from the project’s Emscripten file-packager output and deliberately removes package IndexedDB caching.

## LÖVE 11.5 and runtime dependencies

LÖVE is licensed under zlib and its binary distribution contains components under additional permissive and copyleft licenses. The full upstream LÖVE 11.5 licensing file, including component notices and complete license texts, is retained at:

- `runtime/LICENSE-LOVE-11.5.txt`

That file identifies LÖVE, ENet, FreeType, GLAD, glslang, Lua compatibility components, LuaJIT/Lua modules, LZ4, LodePNG, TinyEXR, UTF8-CPP, xxHash, dr_flac, stb_image, libmpg123, OpenAL Soft, SDL, and other bundled components and their terms.

## Emscripten 2.0.0

Davidobot/love.js documents Emscripten 2.0.0 as its build toolchain. The Emscripten MIT and University of Illinois/NCSA license text is retained at:

- `runtime/LICENSE-Emscripten-2.0.0.txt`

## Suite-authored compatibility code

`runtime/patches/bit.lua`, the original TypeScript ZIP/DEFLATE/CRC implementation in `modules/zip.ts`, the native Scripting host modules, and runtime shell modifications are distributed under this project’s `LICENSE`. The bit module is an original pure-Lua implementation of the seven operations Gen1Recomp uses (`band`, `bor`, `bxor`, `bnot`, `lshift`, `rshift`, `arshift`); it is not copied from LuaJIT.