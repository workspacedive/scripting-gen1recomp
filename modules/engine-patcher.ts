import { createRepackedZip, decodeUtf8, encodeUtf8, extractLocalZipEntry, readLocalZip, zipCrc32 } from "./zip"
import type { RepackedZipFile } from "./zip"

function replaceOnce(text: string, oldValue: string, newValue: string, label: string): string {
  const first = text.indexOf(oldValue)
  if (first < 0 || text.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`Engine update is not Web-compatible: expected one ${label} patch point.`)
  }
  return text.slice(0, first) + newValue + text.slice(first + oldValue.length)
}

// Pure deterministic SHA-256 keeps layer generation worker-safe and makes the
// layer's own per-file manifest independently verifiable before activation.
function sha256Hex(bytes: Uint8Array): string {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const message = new Uint8Array(paddedLength)
  message.set(bytes)
  message[bytes.length] = 0x80
  const bitLength = bytes.length * 8
  const view = new DataView(message.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  const rotate = (value: number, count: number) => (value >>> count) | (value << (32 - count))
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]
      const b = words[index - 2]
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10)
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const first = (h + s1 + choice + constants[index] + words[index]) >>> 0
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const second = (s0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + first) >>> 0
      d = c; c = b; b = a; a = (first + second) >>> 0
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0
  }
  return [...state].map(value => value.toString(16).padStart(8, "0")).join("")
}

const MAIN_BOOTSTRAP = `bit = bit or require("bit") -- love.js uses standard Lua 5.1 without LuaJIT

-- love.js embeds standard PUC Lua 5.1, while desktop LÖVE normally embeds
-- LuaJIT and accepts a few later syntax extensions. Apply only narrow,
-- semantics-preserving source compatibility before compiling Web mod code.
local function sourceLineParts(line)
  local indent, code = line:match("^([ \\t]*)(.-)[ \\t]*$")
  return indent or "", code or line
end

local function sourceLoopOpener(code)
  return code:match("^for%s+.-%s+do%s*;?$") ~= nil
    or code:match("^while%s+.-%s+do%s*;?$") ~= nil
end

local function rewriteTerminalContinueGotos(source)
  local original = source
  source = source:gsub("\\r\\n", "\\n"):gsub("\\r", "\\n")
  local lines = {}
  for line in (source .. "\\n"):gmatch("(.-)\\n") do lines[#lines + 1] = line end
  local changed = 0

  while true do
    local labelIndex, labelIndent, labelName
    for i = #lines, 1, -1 do
      local indent, name = lines[i]:match("^([ \\t]*)::([%a_][%w_]*)::[ \\t]*$")
      if name then labelIndex, labelIndent, labelName = i, indent, name; break end
    end
    if not labelIndex then break end

    -- Only a terminal label immediately before its loop end is a
    -- continue. Anything less constrained is left for the normal parser to
    -- reject rather than guessing at arbitrary goto control flow.
    local endIndex = labelIndex + 1
    while endIndex <= #lines and (lines[endIndex]:match("^[ \\t]*$")
        or lines[endIndex]:match("^[ \\t]*%-%-")) do
      endIndex = endIndex + 1
    end
    if endIndex > #lines then return original, 0 end
    local endIndent, endCode = sourceLineParts(lines[endIndex])
    endCode = endCode:gsub("%s*%-%-.*$", ""):gsub("%s+$", "")
    if endCode ~= "end" or #endIndent >= #labelIndent then return original, 0 end

    local openerIndex
    for i = labelIndex - 1, 1, -1 do
      local indent, code = sourceLineParts(lines[i])
      if indent == endIndent and sourceLoopOpener(code) then openerIndex = i; break end
    end
    if not openerIndex then return original, 0 end

    local replacements = 0
    for i = openerIndex + 1, labelIndex - 1 do
      local _, code = sourceLineParts(lines[i])
      -- Wrapping in repeat/until changes the target of a real break or a
      -- nested-loop break, so reject those regions instead of changing them.
      if sourceLoopOpener(code) or code:match("%f[%a]repeat%f[%A]")
          or code:match("%f[%a]break%f[%A]")
          or code:match("%f[%a]function%f[%A]") then return original, 0 end
      if lines[i]:match("%f[%a]goto%s+" .. labelName .. "%f[%A]") then
        if not code:match("^if%s+.-%s+then%s+goto%s+" .. labelName
            .. "%s+end%s*;?$") then return original, 0 end
        lines[i] = lines[i]:gsub("goto%s+" .. labelName, "break", 1)
        replacements = replacements + 1
      end
    end
    if replacements == 0 then return original, 0 end
    lines[labelIndex] = labelIndent .. "until true"
    table.insert(lines, openerIndex + 1, endIndent .. "  repeat")
    changed = changed + 1
  end

  -- No recognized continue loop means no newline or other byte normalization.
  -- Preserve ordinary sources exactly (including CRLF and final-newline state).
  if changed == 0 then return original, 0 end
  local output = table.concat(lines, "\\n")
  if output:match("%f[%a]goto%f[%A]") or output:match("::[%a_][%w_]*::") then
    return original, 0
  end
  return output, changed
end

local function rewriteWebImageEncodeGuard(source, chunkName)
  -- Wilds of Kanto 1.12.2 optionally bakes battle art through a Canvas. On
  -- WebGL/iOS the readable Canvas can legitimately return rgba4 ImageData,
  -- while LÖVE 11.5's PNG encoder accepts only rgba8/rgba16. Entering the
  -- native encoder raises outside Lua's pcall boundary in compatibility
  -- love.js. Keep the publisher archive byte-identical and add the same
  -- capability check in memory at its exact compile boundary. bakeSheet's
  -- documented nil fallback then keeps the bundled runtime sheet in use.
  if chunkName ~= "@mods/overworld_wild_spawns/lib/spawn_render.lua" then
    return source, 0
  end
  local old = [[  if not (love.filesystem and idata.encode and love.filesystem.write) then
    return nil
  end

  local dirOk, dirErr = pcall(love.filesystem.createDirectory, CACHE_DIR)
]]
  local new = [[  if not (love.filesystem and idata.encode and love.filesystem.write) then
    return nil
  end
  local imageFormat = idata.getFormat and idata:getFormat() or nil
  if imageFormat and imageFormat ~= "rgba8" and imageFormat ~= "rgba16" then
    if log then log("cache encode skipped for %s: unsupported ImageData format %s",
      tostring(species), tostring(imageFormat)) end
    return nil
  end

  local dirOk, dirErr = pcall(love.filesystem.createDirectory, CACHE_DIR)
]]
  local first, last = source:find(old, 1, true)
  if not first or source:find(old, last + 1, true) then return source, 0 end
  return source:sub(1, first - 1) .. new .. source:sub(last + 1), 1
end

local function exactSourceReplacement(source, old, new)
  local first, last = source:find(old, 1, true)
  if not first or source:find(old, last + 1, true) then return source, false end
  return source:sub(1, first - 1) .. new .. source:sub(last + 1), true
end

local function rewritePotatoVoxel144WebGuards(source, chunkName)
  -- PotatoVoxel v1.4.4 uses a Lua TABLE for this mesh map. LÖVE table-form
  -- maps are one-based; only Data-form maps use raw zero-based GPU indices.
  -- The invalid map exception is caught by the mod, but the same decal is
  -- otherwise rebuilt/retried every frame. Bind the repair to the exact mod
  -- id, file, and unique publisher source block; never change general maps.
  if chunkName == "@mods/potato_voxel/lib/SpriteBillboards.lua" then
    local old = [[  local indices = {}
  for i = 1, 7 do
    indices[#indices + 1] = 0
    indices[#indices + 1] = i
    indices[#indices + 1] = i + 1
  end
  indices[#indices + 1] = 0
  indices[#indices + 1] = 8
  indices[#indices + 1] = 1
  return Voxel3D.newMesh(verts, indices)
]]
    local new = [[  local indices = {}
  for i = 1, 7 do
    indices[#indices + 1] = 1
    indices[#indices + 1] = i + 1
    indices[#indices + 1] = i + 2
  end
  indices[#indices + 1] = 1
  indices[#indices + 1] = 9
  indices[#indices + 1] = 2
  return Voxel3D.newMesh(verts, indices)
]]
    local replaced
    source, replaced = exactSourceReplacement(source, old, new)
    return source, replaced and 1 or 0
  end

  if chunkName == "@mods/potato_voxel/lib/OverworldBattle.lua" then
    local guardOld = [[function OverworldBattle.update(dt)
  if not session then return end

  local g = game()
]]
    local guardNew = [[function OverworldBattle.update(dt)
  if not session then return end
  -- A failed arena is retired for this battle. The publisher already sets
  -- session.broken below; without this guard the complete render retries on
  -- every later update despite the documented one-failure fallback.
  if session.broken then return end

  local g = game()
]]
    local renderOld = [[  local ok, shot = pcall(BattleScene.render, session.state, session.arena,
                         textures, session.token)
]]
    local renderNew = [[  local ok, shot = xpcall(function()
    return BattleScene.render(session.state, session.arena, textures, session.token)
  end, function(err)
    if debug and debug.traceback then return debug.traceback(tostring(err), 2) end
    return tostring(err)
  end)
]]
    local guardFirst, guardLast = source:find(guardOld, 1, true)
    local renderFirst, renderLast = source:find(renderOld, 1, true)
    if not guardFirst or source:find(guardOld, guardLast + 1, true)
        or not renderFirst or source:find(renderOld, renderLast + 1, true) then
      return source, 0
    end
    source = source:sub(1, renderFirst - 1) .. renderNew
      .. source:sub(renderLast + 1)
    source = source:sub(1, guardFirst - 1) .. guardNew
      .. source:sub(guardLast + 1)
    return source, 2
  end

  if chunkName == "@mods/potato_voxel/lib/VoxelScene.lua" then
    local declarationOld = [[local function drawShadow(sprite, px, py, facing, phase, flip, gh, lift)
]]
    local declarationNew = [[-- A driver-specific decal failure is a feature failure, not a frame task.
-- Keep the detailed first traceback and then leave the ordinary lit scene up.
local actorDecalPassAvailable = true
local function drawShadow(sprite, px, py, facing, phase, flip, gh, lift)
]]
    local conditionOld = [[  if shadowsOn and (not Voxel3D.shadowsActive() or not actorMapActive) then
]]
    local conditionNew = [[  if actorDecalPassAvailable and shadowsOn
      and (not Voxel3D.shadowsActive() or not actorMapActive) then
]]
    local passOld = [[    local ok = pcall(function()
      Voxel3D.beginShadows()
      for _, p in ipairs(posed) do
        drawShadow(p.sprite, p.anchorX or p.px, p.anchorY or p.py,
                   viewFacing(p), p.phase, p.flip, p.gh, p.lift)
      end
      Voxel3D.endShadows()
    end)
    if not ok then
      pcall(Voxel3D.endShadows, Voxel3D)
      pcall(print, "[PotatoVoxel] actor decal pass aborted")
    end
]]
    local passNew = [[    local ok, decalError = xpcall(function()
      Voxel3D.beginShadows()
      for _, p in ipairs(posed) do
        drawShadow(p.sprite, p.anchorX or p.px, p.anchorY or p.py,
                   viewFacing(p), p.phase, p.flip, p.gh, p.lift)
      end
      Voxel3D.endShadows()
    end, function(err)
      if debug and debug.traceback then return debug.traceback(tostring(err), 2) end
      return tostring(err)
    end)
    if not ok then
      actorDecalPassAvailable = false
      pcall(Voxel3D.endShadows, Voxel3D)
      pcall(print, "[PotatoVoxel] actor decal pass disabled after one failure: "
        .. tostring(decalError))
    end
]]
    local dFirst, dLast = source:find(declarationOld, 1, true)
    local cFirst, cLast = source:find(conditionOld, 1, true)
    local pFirst, pLast = source:find(passOld, 1, true)
    if not dFirst or source:find(declarationOld, dLast + 1, true)
        or not cFirst or source:find(conditionOld, cLast + 1, true)
        or not pFirst or source:find(passOld, pLast + 1, true) then
      return source, 0
    end
    source = source:sub(1, pFirst - 1) .. passNew .. source:sub(pLast + 1)
    source = source:sub(1, cFirst - 1) .. conditionNew .. source:sub(cLast + 1)
    source = source:sub(1, dFirst - 1) .. declarationNew .. source:sub(dLast + 1)
    return source, 3
  end

  return source, 0
end

function GEN1RECOMP_LUA51_SOURCE(source, chunkName)
  if type(source) ~= "string" then return source, 0, 0, 0 end
  if source:sub(1, 3) == "\\239\\187\\191" then source = source:sub(4) end
  -- LuaJIT integer suffixes do not parse in standard Lua 5.1. Web builds
  -- have no FFI/VR path, but those modules are still compiled at startup.
  source = source:gsub("(0x[%da-fA-F]+)[uU]?[lL][lL]", "%1")
  local loops, imageGuards, potatoFixes
  source, loops = rewriteTerminalContinueGotos(source)
  source, imageGuards = rewriteWebImageEncodeGuard(source, chunkName)
  source, potatoFixes = rewritePotatoVoxel144WebGuards(source, chunkName)
  return source, loops, imageGuards, potatoFixes
end

-- LuaJIT accepts a source string in load(); standard Lua 5.1 requires
-- loadstring(). Preserve reader-function behavior while supplying the modern
-- string form used by API-2 mods such as Dramatic Shape. Wrap loadstring too:
-- legitimate mods such as Wilds compile their own modules from mod:read.
local nativeLoad = load
local nativeLoadstring = loadstring
if nativeLoadstring then
  loadstring = function(source, chunkName)
    if type(source) == "string" then
      local imageGuards, potatoFixes
      source, _, imageGuards, potatoFixes = GEN1RECOMP_LUA51_SOURCE(source, chunkName)
      if imageGuards > 0 then
        print("[native-compat] guarded unsupported ImageData PNG encode: "
          .. tostring(chunkName))
      end
      if potatoFixes > 0 then
        print("[native-compat] applied PotatoVoxel v1.4.4 Web stability guards: "
          .. tostring(chunkName) .. " (" .. tostring(potatoFixes) .. ")")
      end
    end
    return nativeLoadstring(source, chunkName)
  end
  load = function(source, chunkName)
    if type(source) == "string" then return loadstring(source, chunkName) end
    return nativeLoad(source, chunkName)
  end
end

-- Some optional GLES depth formats in the compatibility port log an error
-- but never return to Lua when newCanvas is called. Reject formats that LÖVE
-- itself reports unsupported before entering the native binding, so mods can
-- fall back to an internal depth buffer instead of stalling on a black frame.
if love and love.system and love.system.getOS() == "Web"
    and love.graphics and love.graphics.getCanvasFormats then
  local supportedCanvasFormats = love.graphics.getCanvasFormats(true)
  local nativeNewCanvas = love.graphics.newCanvas
  love.graphics.newCanvas = function(...)
    local args = { ... }
    local settings = type(args[1]) == "table" and args[1]
      or (type(args[3]) == "table" and args[3] or nil)
    local format = settings and settings.format
    if settings and settings.readable ~= false and type(format) == "string"
        and format:match("^depth") and supportedCanvasFormats[format] ~= true then
      error("unsupported readable canvas format: " .. format, 2)
    end
    return nativeNewCanvas(unpack(args))
  end
end

`

function patchMain(bytes: Uint8Array): Uint8Array {
  let text = decodeUtf8(bytes)
  const editorAnchor = 'local editorMode = os.getenv("POKEPORT_EDITOR") == "1" or POKEPORT_EDITOR_MODE == true\n'
  text = replaceOnce(text, editorAnchor, MAIN_BOOTSTRAP + editorAnchor, "Lua/Web bootstrap")
  text = replaceOnce(text,
    `  function love.errorhandler(msg)
    local hint = SwitchDiagnostics.logLuaError(msg)
`,
    `  function love.errorhandler(msg)
    -- Print and persist the original Lua traceback before diagnostics does any
    -- filesystem work. Davidobot's compatibility WASM displays a generic
    -- browser alert for every love::Exception, including a missing optional
    -- file caught inside Lua, so the original failure must survive separately.
    local detail = tostring(msg or "unknown error")
    if debug and debug.traceback then
      detail = debug.traceback("Unhandled Lua error: " .. detail, 2)
    else
      detail = "Unhandled Lua error: " .. detail
    end
    print("[native-lua-error] " .. detail)
    local hint = SwitchDiagnostics.logLuaError(detail)
`, "complete Lua error diagnostics")
  text = replaceOnce(text,
    '  local importPath = os.getenv("POKEPORT_IMPORT_ROM")\n',
    `  local importPath = os.getenv("POKEPORT_IMPORT_ROM")
  local webVersion
  -- Browser handoff: the native host preloads the selected, user-owned ROM.
  if not importPath then
    for _, version in ipairs({ "red", "blue", "yellow", "gold" }) do
      local candidate = "web-rom-" .. version .. ".gbc"
      local webRom = io.open(candidate, "rb")
      if webRom then
        webRom:close()
        importPath = candidate
        webVersion = version
        break
      end
    end
  end
`, "preloaded browser ROM")
  text = replaceOnce(text,
    '  local scriptedVersion = os.getenv("POKEPORT_VERSION")\n',
    '  local scriptedVersion = webVersion or os.getenv("POKEPORT_VERSION")\n',
    "preloaded browser game version")
  text = replaceOnce(text,
    `function love.lowmemory()
  if editorMode or TouchEditor or Importer then return end
  if Game then Game:onResume() end
end
`,
    `function love.lowmemory()
  if editorMode or TouchEditor or Importer then return end
  if Game then Game:onResume() end
  if love.system and love.system.getOS() == "Web" then
    collectgarbage("collect")
    print(string.format("[native-telemetry] lowmemory luaKB=%.1f", collectgarbage("count")))
  end
end
`, "Web low-memory collection")
  text = replaceOnce(text,
    `  local dt = 0

  return function()
`,
    `  local dt = 0
  local telemetryEnabled = love.system and love.system.getOS() == "Web"
  local telemetryStats = {}
  local telemetryAt = telemetryEnabled and love.timer and love.timer.getTime() + 10 or nil

  return function()
`, "Web Lua telemetry state")
  text = replaceOnce(text,
    `      love.graphics.present()
    end

    if love.timer then
`,
    `      love.graphics.present()
    end

    if telemetryAt and love.timer then
      local telemetryNow = love.timer.getTime()
      if telemetryNow >= telemetryAt then
        local ok = love.graphics and pcall(love.graphics.getStats, telemetryStats)
        print(string.format("[native-telemetry] luaKB=%.1f drawcalls=%s batched=%s canvasswitches=%s textureBytes=%s images=%s canvases=%s fonts=%s",
          collectgarbage("count"), tostring(ok and telemetryStats.drawcalls or "na"),
          tostring(ok and telemetryStats.drawcallsbatched or "na"),
          tostring(ok and telemetryStats.canvasswitches or "na"),
          tostring(ok and telemetryStats.texturememory or "na"),
          tostring(ok and telemetryStats.images or "na"),
          tostring(ok and telemetryStats.canvases or "na"),
          tostring(ok and telemetryStats.fonts or "na")))
        telemetryAt = telemetryNow + 10
      end
    end

    if love.timer then
`, "bounded Web Lua/graphics telemetry")
  return encodeUtf8(text)
}

function patchLoader(bytes: Uint8Array): Uint8Array {
  let text = decodeUtf8(bytes)
  text = replaceOnce(text,
    'local MOD_STATE_FILE = "mod_state.lua" -- legacy migration only\n',
    `local MOD_STATE_FILE = "mod_state.lua" -- legacy migration only
local NATIVE_MOD_STATE_FILE = "native_mod_state.json"
local NATIVE_MOD_OPTIONS_FILE = "native_mod_options.json"
local NATIVE_OPTION_TYPES = { toggle = true, choice = true, number = true, text = true }
local NATIVE_MAX_OPTION_ROWS = 128
local NATIVE_MAX_OPTION_CHOICES = 128
local NATIVE_MAX_OPTIONS_BYTES = 512 * 1024

local function nativePrimitive(value)
  local kind = type(value)
  if kind == "boolean" then return value end
  if kind == "number" and value == value and value ~= math.huge and value ~= -math.huge then return value end
  if kind == "string" and #value <= 512 and not value:find("[%z\\1-\\8\\11\\12\\14-\\31\\127]") then return value end
  return nil
end

local function nativeText(value, maximum, fallback)
  if type(value) == "string" and #value <= maximum
      and not value:find("[%z\\1-\\8\\11\\12\\14-\\31\\127]") then return value end
  return fallback
end

local function nativeKey(value)
  return type(value) == "string" and #value <= 80
    and value:match("^[%w_%.:%-]+$") and value ~= "__proto__"
    and value ~= "prototype" and value ~= "constructor"
end

local function nativeOptionChoice(rawChoice)
  if type(rawChoice) ~= "table" then return nil end
  -- RFC 0008 uses { label, value }; tolerate the common object spelling too.
  -- Do not use a-and-primitive(value)-or-nil: a legitimate false value
  -- would be collapsed to nil and reject the whole schema.
  local rawValue = rawChoice[2]
  if rawValue == nil then rawValue = rawChoice.value end
  local rawLabel = rawChoice[1]
  if rawLabel == nil then rawLabel = rawChoice.label end
  local value = nativePrimitive(rawValue)
  local label = nativeText(rawLabel, 160, nil)
  if value == nil or label == nil then return nil end
  return { label, value }
end

local function nativeOptionRow(raw, seen)
  if type(raw) ~= "table" or not nativeKey(raw.key) or seen[raw.key]
      or not NATIVE_OPTION_TYPES[raw.type] then return nil end
  local row = { key = raw.key, type = raw.type,
    label = nativeText(raw.label, 160, raw.key) }
  local description = nativeText(raw.description, 1200, nil)
    or nativeText(raw.help, 1200, nil)
  if description then row.description = description end
  if raw.type == "toggle" then
    row.default = type(raw.default) == "boolean" and raw.default or false
  elseif raw.type == "choice" then
    if type(raw.choices) ~= "table" or #raw.choices == 0
        or #raw.choices > NATIVE_MAX_OPTION_CHOICES then return nil end
    row.choices = {}
    local values = {}
    for _, rawChoice in ipairs(raw.choices) do
      local choice = nativeOptionChoice(rawChoice)
      if choice == nil then return nil end
      local identity = type(choice[2]) .. ":" .. tostring(choice[2])
      if values[identity] then return nil end
      values[identity] = true
      row.choices[#row.choices + 1] = choice
    end
    if #row.choices ~= #raw.choices then return nil end
    row.default = nativePrimitive(raw.default)
    local found = false
    if row.default ~= nil then
      for _, choice in ipairs(row.choices) do
        if type(choice[2]) == type(row.default) and choice[2] == row.default then found = true break end
      end
    end
    if not found then row.default = row.choices[1][2] end
  elseif raw.type == "number" then
    row.default = nativePrimitive(raw.default)
    if type(row.default) ~= "number" then row.default = 0 end
    for _, field in ipairs({ "min", "max", "step" }) do
      if raw[field] ~= nil then
        local value = nativePrimitive(raw[field])
        if type(value) ~= "number" then return nil end
        row[field] = value
      end
    end
    if row.min and row.max and row.min > row.max
        or row.step and row.step <= 0 then return nil end
  else
    row.default = nativeText(raw.default, 512, "")
    local maxLen = tonumber(raw.maxLen or raw.maxLength) or 7
    maxLen = math.max(1, math.min(512, math.floor(maxLen)))
    if #row.default > maxLen then return nil end
    row.maxLen = maxLen
  end
  return row
end

local function nativeSchemaRows(schema)
  if type(schema) ~= "table" or #schema == 0 or #schema > NATIVE_MAX_OPTION_ROWS then return nil, 0 end
  local rows, seen, rejected = {}, {}, 0
  for _, raw in ipairs(schema) do
    local row = nativeOptionRow(raw, seen)
    if row then
      seen[row.key] = true
      rows[#rows + 1] = row
    else
      rejected = rejected + 1
    end
  end
  if #rows == 0 then return nil, rejected end
  return rows, rejected
end

local function nativeEmptyOptionsState()
  return { schema = 2, values = {}, known = {}, suppressProfile = {},
    schemas = {}, probed = {} }
end
`, "native mod filenames and option schema bounds")
  text = replaceOnce(text,
    `function Loader:_discover()
  if not self.fs.getDirectoryItems then return end
`,
    `function Loader:_discover()
  -- The native Web host stores validated mods as normalized ZIPs. PhysFS
  -- mounts them lazily, avoiding thousands of native and Emscripten file
  -- creations while keeping the ordinary mods/<id> view for the real loader.
  if love and love.system and love.system.getOS() == "Web"
      and self.fs == love.filesystem and self.fs.mount and self.fs.getDirectoryItems then
    local archiveRoot = "native-mod-packages"
    if self.fs.getInfo(archiveRoot, "directory") then
      if self.fs.createDirectory then self.fs.createDirectory("mods") end
      for _, name in ipairs(self.fs.getDirectoryItems(archiveRoot)) do
        local id = name:match("^([%w_%-]+)%.zip$")
        if id then
          local ok, mounted = pcall(self.fs.mount,
            archiveRoot .. "/" .. name, "mods/" .. id, true)
          if not ok or not mounted then
            Logger.error("native mod archive %s could not be mounted: %s",
              name, tostring(mounted))
          else
            Logger.info("mounted native mod archive %s", name)
          end
        end
      end
    end
  end
  if not self.fs.getDirectoryItems then return end
`, "native packed-mod mount")
  text = replaceOnce(text,
    `  -- mod.options reads through this; M11 owns writing it back
  self.modOptions = options.modOptions or {}
`,
    `  -- Native enablement is one bounded JSON mirror. It is read only after
  -- probing because compatibility PhysFS may not return from an absent read.
  if self.fs.getInfo and self.fs.read and self.fs.getInfo(NATIVE_MOD_STATE_FILE, "file") then
    local raw = self.fs.read(NATIVE_MOD_STATE_FILE)
    local ok, state = false, nil
    if raw and #raw <= NATIVE_MAX_OPTIONS_BYTES then ok, state = pcall(Json.decode, raw) end
    if ok and type(state) == "table" and state.schema == 1 and type(state.mods) == "table" then
      for id, enabled in pairs(state.mods) do
        if type(id) == "string" and type(enabled) == "boolean" then
          if enabled then self.disabled[id] = nil else self.disabled[id] = true end
        end
      end
    end
  end

  -- Keep the pre-native values for a one-time legacy migration after each
  -- genuine mod has declared its schema. No Lua is parsed or run by native UI.
  _G.GEN1RECOMP_NATIVE_OPTIONS_CAPTURE = nil
  self.nativeOptionsReady = false
  self.modOptions = options.modOptions or {}
  self.nativeOriginalOptions = {}
  for id, bucket in pairs(self.modOptions) do
    if type(id) == "string" and type(bucket) == "table" then
      local copy = {}
      for key, value in pairs(bucket) do
        if nativeKey(key) and nativePrimitive(value) ~= nil then copy[key] = value end
      end
      self.nativeOriginalOptions[id] = copy
    end
  end

  local state = nativeEmptyOptionsState()
  if self.fs.getInfo and self.fs.read and self.fs.getInfo(NATIVE_MOD_OPTIONS_FILE, "file") then
    local raw = self.fs.read(NATIVE_MOD_OPTIONS_FILE)
    local ok, decoded = false, nil
    if raw and #raw <= NATIVE_MAX_OPTIONS_BYTES then ok, decoded = pcall(Json.decode, raw) end
    if ok and type(decoded) == "table" and decoded.schema == 2 then state = decoded end
  end
  state.values = type(state.values) == "table" and state.values or {}
  state.known = type(state.known) == "table" and state.known or {}
  state.suppressProfile = type(state.suppressProfile) == "table" and state.suppressProfile or {}
  state.schemas = type(state.schemas) == "table" and state.schemas or {}
  state.probed = type(state.probed) == "table" and state.probed or {}
  self.nativeOptionState = state

  -- Every known key is cleared first, so deleting a native override really
  -- reaches the mod's current default instead of reviving stale options.lua.
  if type(state.managed) == "table" then
    for id, keys in pairs(state.managed) do
      if type(id) == "string" and type(keys) == "table" then
        self.modOptions[id] = self.modOptions[id] or {}
        for _, key in ipairs(keys) do
          if nativeKey(key) then self.modOptions[id][key] = nil end
        end
      end
    end
  end
  local function applyBuckets(buckets)
    if type(buckets) ~= "table" then return end
    for id, bucket in pairs(buckets) do
      if type(id) == "string" and type(bucket) == "table" then
        self.modOptions[id] = self.modOptions[id] or {}
        for key, value in pairs(bucket) do
          local selected = nativePrimitive(value)
          if nativeKey(key) and selected ~= nil then self.modOptions[id][key] = selected end
        end
      end
    end
  end
  -- Profiles seed unspecified settings; explicit native/in-game choices win.
  applyBuckets(state.profile)
  applyBuckets(state.values)
  options.modOptions = self.modOptions
`, "native mod state/options restore")
  text = replaceOnce(text,
    `function Loader:_saveState()
`,
    `function Loader:_writeNativeOptions()
  if not (self.fs and self.fs.write and self.nativeOptionState) then return end
  local encoded = Json.encode(self.nativeOptionState)
  if type(encoded) == "string" and #encoded <= NATIVE_MAX_OPTIONS_BYTES then
    self.fs.write(NATIVE_MOD_OPTIONS_FILE, encoded)
  else
    Logger.error("native mod options exceeded the bounded mirror")
  end
end

function Loader:_captureNativeOptions(modOptions)
  if not self.nativeOptionsReady or type(modOptions) ~= "table" then return end
  local state, changed = self.nativeOptionState, false
  for id, schema in pairs(state.schemas or {}) do
    if type(schema) == "table" and type(schema.rows) == "table" then
      local current = type(modOptions[id]) == "table" and modOptions[id] or {}
      local last = self.nativeOptionLast[id] or {}
      state.values[id] = type(state.values[id]) == "table" and state.values[id] or {}
      for _, row in ipairs(schema.rows) do
        local key = row.key
        local value = nativePrimitive(current[key])
        local prior = nativePrimitive(last[key])
        if nativeKey(key) and (type(value) ~= type(prior) or value ~= prior) then
          state.values[id][key] = value
          last[key] = value
          changed = true
        end
      end
      self.nativeOptionLast[id] = last
    end
  end
  if changed then self:_writeNativeOptions() end
end

function Loader:_finalizeNativeOptions()
  local state = self.nativeOptionState or nativeEmptyOptionsState()
  local knownSets = {}
  for id, keys in pairs(state.known) do
    local set = {}
    if type(keys) == "table" then
      for _, key in ipairs(keys) do if nativeKey(key) then set[key] = true end end
    end
    knownSets[id] = set
  end

  for _, mod in ipairs(self.loaded) do
    local id, version = mod.manifest.id, mod.manifest.version
    local schema = self.optionSchemas[id]
    -- This is the genuine engine's own lazy options_schema path. It executes
    -- only inside the already-running game sandbox, never in native UI.
    if schema == nil and mod.manifest.options_schema and self.fs.load then
      local chunk = self.fs.load(mod.path .. "/" .. mod.manifest.options_schema)
      if chunk then
        local ok, rows = pcall(chunk)
        if ok and type(rows) == "table" then schema = rows end
      end
    end
    state.probed[id] = version
    local rows, rejected = nativeSchemaRows(schema)
    if rejected > 0 then
      Logger.warn("native options skipped %d malformed row(s) for %s", rejected, id)
    end
    if rows then
      state.schemas[id] = { version = version, rows = rows }
      state.values[id] = type(state.values[id]) == "table" and state.values[id] or {}
      local known, list = knownSets[id] or {}, {}
      local original = self.nativeOriginalOptions[id] or {}
      for _, row in ipairs(rows) do
        if not known[row.key] then
          local legacy = nativePrimitive(original[row.key])
          local profiled = type(state.profile) == "table" and type(state.profile[id]) == "table"
            and nativePrimitive(state.profile[id][row.key]) ~= nil
          if legacy ~= nil and not profiled then state.values[id][row.key] = legacy end
          known[row.key] = true
        end
      end
      for key in pairs(known) do list[#list + 1] = key end
      table.sort(list)
      state.known[id] = list
    else
      state.schemas[id] = nil
    end
  end

  self.nativeOptionState = state
  self.nativeOptionLast = {}
  for id, schema in pairs(state.schemas) do
    local current = self.modOptions[id] or {}
    local last = {}
    for _, row in ipairs(schema.rows or {}) do
      local value = nativePrimitive(current[row.key])
      if value ~= nil then last[row.key] = value end
    end
    self.nativeOptionLast[id] = last
  end
  self.nativeOptionsReady = true
  _G.GEN1RECOMP_NATIVE_OPTIONS_CAPTURE = function(modOptions)
    self:_captureNativeOptions(modOptions)
  end
  self:_writeNativeOptions()
end

function Loader:_saveState()
`, "native mod option schema capture")
  text = replaceOnce(text,
    `  -- the load set is final here, so every surviving mod's recipe builds its
`,
    `  -- Export only bounded, primitive schema data after genuine Gen1Recomp
  -- has loaded the mods. Native UI consumes the mirror on return.
  self:_finalizeNativeOptions()
  -- the load set is final here, so every surviving mod's recipe builds its
`, "native mod option finalization")
  text = replaceOnce(text,
    `  function api:read(relative)
    local path = self.path .. "/" .. relative
    return loader.fs.read(path)
  end
`,
    `  function api:read(relative)
    local path = self.path .. "/" .. relative
    -- compatibility love.js does not return from a missing PhysFS read;
    -- optional mod assets must probe before attempting to read.
    if loader.fs.getInfo and loader.fs.getInfo(path, "file") == nil then return nil end
    return loader.fs.read(path)
  end
`, "missing optional mod-file guard")
  text = replaceOnce(text,
    `function Loader:_loadMod(mod)
  local path = mod.path .. "/" .. mod.manifest.entry
  local chunk, err = self.fs.load(path)
  if not chunk then error(err or ("unable to load " .. path)) end
`,
    `function Loader:_loadMod(mod)
  local path = mod.path .. "/" .. mod.manifest.entry
  local chunk, err
  if _G.GEN1RECOMP_LUA51_SOURCE and self.fs.read and loadstring then
    local source, readErr = self.fs.read(path)
    if not source then error(readErr or ("unable to read " .. path)) end
    local rewrites, imageGuards, potatoFixes
    source, rewrites, imageGuards, potatoFixes = GEN1RECOMP_LUA51_SOURCE(source, "@" .. path)
    chunk, err = loadstring(source, "@" .. path)
    if chunk and rewrites > 0 then
      Logger.info("applied Lua 5.1 continue compatibility: %s (%d loops)",
        path, rewrites)
    end
    if chunk and imageGuards > 0 then
      Logger.info("applied Web ImageData encode compatibility: %s (%d guards)",
        path, imageGuards)
    end
    if chunk and potatoFixes > 0 then
      Logger.info("applied PotatoVoxel v1.4.4 Web stability guards: %s (%d)",
        path, potatoFixes)
    end
  else
    chunk, err = self.fs.load(path)
  end
  if not chunk then error(err or ("unable to load " .. path)) end
`, "Lua 5.1 mod entry compatibility")
  text = replaceOnce(text,
    `  for id in pairs(self.mods) do
    SaveData.setModEnabled(options, id, not self.disabled[id], scope)
    -- only the games this boot can answer for: another version's overrides
    -- are not this run's to rewrite.  With no version (an injected-generation
    -- harness) the override stays in memory for this boot only.
    SaveData.setModForced(options, id, self.gen2Forced[id] == true, version)
  end
  SaveData.saveOptions(options, self.fs)
end
`,
    `  local nativeState = { schema = 1, mods = {} }
  for id in pairs(self.mods) do
    local enabled = not self.disabled[id]
    SaveData.setModEnabled(options, id, enabled, scope)
    nativeState.mods[id] = enabled
    -- only the games this boot can answer for: another version's overrides
    -- are not this run's to rewrite.  With no version (an injected-generation
    -- harness) the override stays in memory for this boot only.
    SaveData.setModForced(options, id, self.gen2Forced[id] == true, version)
  end
  SaveData.saveOptions(options, self.fs)
  if self.fs.write then self.fs.write(NATIVE_MOD_STATE_FILE, Json.encode(nativeState)) end
end
`, "native mod-state persistence")
  return encodeUtf8(text)
}

function patchSaveData(bytes: Uint8Array): Uint8Array {
  return encodeUtf8(replaceOnce(decodeUtf8(bytes),
    `  remove(fs, OPTIONS_TMP_FILENAME)
  return opts
end
`,
    `  remove(fs, OPTIONS_TMP_FILENAME)
  -- The Web-native bridge observes only the primitive mod-options subtree.
  -- It cannot affect a failed options write and runs after verification.
  if _G.GEN1RECOMP_NATIVE_OPTIONS_CAPTURE then
    pcall(GEN1RECOMP_NATIVE_OPTIONS_CAPTURE, opts.modOptions or {})
  end
  return opts
end
`, "native mod option write observation"))
}

function patchAssetTransform(bytes: Uint8Array): Uint8Array {
  let text = decodeUtf8(bytes)
  text = replaceOnce(text, "local AssetTransform = {}\n", `local AssetTransform = {}

-- The no-pthreads Web runtime cannot safely run Lua/LÖVE work in parallel.
-- Heavy first-boot transforms are instead sliced cooperatively: the game can
-- finish booting, then one generated image is committed per frame. Desktop
-- and native LÖVE retain the upstream synchronous behavior.
local deferredTasks = {}
local deferredHookInstalled = false

local function webRuntime(fs)
  return love and love.system and love.system.getOS() == "Web"
    and fs and fs.read and love.update ~= nil
end

local function reportDeferredFailure(task, message)
  local reason = "asset transform failed: " .. tostring(message)
  Logger.error("[%s] %s", task.modId, reason)
  Runtime.reportError(task.modId, reason)
  task.loader.errors[#task.loader.errors + 1] = task.modId .. ": " .. reason
  print("[native-assets] failed " .. task.modId)
end

function AssetTransform.step()
  local task = deferredTasks[1]
  if not task then return 0 end
  local resumed, progress = coroutine.resume(task.co)
  if not resumed then
    table.remove(deferredTasks, 1)
    reportDeferredFailure(task, progress)
  elseif coroutine.status(task.co) == "dead" then
    table.remove(deferredTasks, 1)
    Logger.info("deferred asset transform complete: %s (%d files)",
      task.modId, task.count())
    print("[native-assets] complete " .. task.modId .. " " .. task.count())
  elseif type(progress) == "number" and progress % 25 == 0 then
    print("[native-assets] progress " .. task.modId .. " " .. progress)
  end
  return #deferredTasks
end

local function installDeferredHook()
  if deferredHookInstalled then return end
  deferredHookInstalled = true
  local previousUpdate = love.update
  love.update = function(dt)
    AssetTransform.step()
    return previousUpdate(dt)
  end
end
`, "cooperative Web asset-transform scheduler")
  text = replaceOnce(text,
    "local function contextFor(modId, fs)\n",
    "local function contextFor(modId, fs, yieldWrites)\n",
    "asset-transform yielding context")
  text = replaceOnce(text,
    `    written = written + 1
    return path
`,
    `    written = written + 1
    if yieldWrites then coroutine.yield(written) end
    return path
`, "asset-transform cooperative yield")
  text = replaceOnce(text,
    `  if not force and fs.read(stampPath) == want then return true end
`,
    `  -- compatibility love.js may not return from a missing PhysFS read.
  -- A first-run transform has no stamp yet, so probe before reading it.
  if not force and fs.getInfo and fs.getInfo(stampPath, "file")
      and fs.read(stampPath) == want then return true end
`, "missing asset-transform stamp guard")
  text = replaceOnce(text,
    `  local ctx, count = contextFor(modId, fs)
  local ok, result = pcall(chunk)
  if ok and type(result) == "function" then
    ok, result = pcall(result, ctx)
  elseif ok and type(result) ~= "function" then
    ok, result = false, "assets_transforms must return a function(ctx)"
  end
  if not ok then
    local reason = "asset transform failed: " .. tostring(result)
    Logger.error("[%s] %s", modId, reason)
    Runtime.reportError(modId, reason)
    return false, reason
  end

  if fs.createDirectory then fs.createDirectory(DERIVED_ROOT .. modId) end
  fs.write(stampPath, want)
  Runtime.emit("assets.transformed", { modId = modId, count = count() })
  return true
`,
    `  local ok, transform = pcall(chunk)
  if not ok then
    return false, "asset transform failed: " .. tostring(transform)
  end
  if type(transform) ~= "function" then
    return false, "asset transform failed: assets_transforms must return a function(ctx)"
  end

  if webRuntime(fs) and not force then
    local ctx, count = contextFor(modId, fs, true)
    local task = {
      modId = modId,
      loader = nil,
      count = count,
    }
    task.co = coroutine.create(function()
      transform(ctx)
      if fs.createDirectory then fs.createDirectory(DERIVED_ROOT .. modId) end
      fs.write(stampPath, want)
      Runtime.emit("assets.transformed", { modId = modId, count = count() })
    end)
    deferredTasks[#deferredTasks + 1] = task
    installDeferredHook()
    print("[native-assets] queued " .. modId)
    return true, task
  end

  local ctx, count = contextFor(modId, fs, false)
  ok, transform = pcall(transform, ctx)
  if not ok then
    local reason = "asset transform failed: " .. tostring(transform)
    Logger.error("[%s] %s", modId, reason)
    Runtime.reportError(modId, reason)
    return false, reason
  end
  if fs.createDirectory then fs.createDirectory(DERIVED_ROOT .. modId) end
  fs.write(stampPath, want)
  Runtime.emit("assets.transformed", { modId = modId, count = count() })
  return true
`, "deferred Web asset-transform execution")
  text = replaceOnce(text,
    `      local ok, reason = AssetTransform.runFor(mod, loader.fs, force)
      if ok then
        ran = ran + 1
`,
    `      local ok, reason = AssetTransform.runFor(mod, loader.fs, force)
      if ok then
        if type(reason) == "table" then reason.loader = loader end
        ran = ran + 1
`, "deferred asset-transform loader attribution")
  return encodeUtf8(text)
}

function patchSwitchDiagnostics(bytes: Uint8Array): Uint8Array {
  return encodeUtf8(replaceOnce(decodeUtf8(bytes),
    `  local text = redactString(tostring(msg or "unknown error"))
  local existing = filesystem.read(ERROR_LOG) or ""
`,
    `  local text = redactString(tostring(msg or "unknown error"))
  -- lua-error.log is optional on the first failure. In Davidobot's
  -- compatibility WASM, even the handled love::Exception from a missing read
  -- emits a generic browser alert and masks the originating Lua exception.
  local existing = ""
  if filesystem.getInfo and filesystem.getInfo(ERROR_LOG, "file") then
    existing = filesystem.read(ERROR_LOG) or ""
  end
`, "missing Lua-error log guard"))
}

function patchCache(bytes: Uint8Array): Uint8Array {
  const text = replaceOnce(decodeUtf8(bytes),
    '  return love.filesystem.read(rel)\n',
    `  -- In the compatibility WebAssembly runtime, PhysFS logs a missing read
  -- but does not return to Lua. Probe first so a new cache can be imported.
  if love.system and love.system.getOS and love.system.getOS() == "Web"
      and love.filesystem.getInfo(rel, "file") == nil then
    return nil
  end
  return love.filesystem.read(rel)
`, "missing cache guard")
  return encodeUtf8(text)
}

function patchTouch(bytes: Uint8Array): Uint8Array {
  return encodeUtf8(replaceOnce(decodeUtf8(bytes),
    '  return osName == "Android" or osName == "iOS"\n',
    '  return osName == "Android" or osName == "iOS" or osName == "Web"\n',
    "Web touch controls"))
}

function patchMusic(bytes: Uint8Array): Uint8Array {
  return encodeUtf8(replaceOnce(decodeUtf8(bytes),
    '  else\n    pcall(src.setLooping, src, wantLoop)\n  end\n',
    `  elseif not isChip then
    -- Queueable sources loop inside ChipSynth; love.js rejects setLooping.
    pcall(src.setLooping, src, wantLoop)
  end
`, "queueable-source looping"))
}

function patchUpdateBoot(bytes: Uint8Array): Uint8Array {
  const upstream = decodeUtf8(bytes)
  for (const marker of ["function Boot.probePayload", "function Boot.select", "function Boot.run", "love.filesystem.mount(rel, \"/\", false)"]) {
    if (!upstream.includes(marker)) {
      throw new Error(`Engine update is not Web-compatible: updater contract marker is missing (${marker}).`)
    }
  }
  return encodeUtf8(`-- Gen1Recomp Native Suite layer-owned updater boundary.
--
-- Host component updates are downloaded, hashed, generated, staged, and
-- transactionally activated by native TypeScript. Writable save-directory
-- payloads must never prepend code ahead of this execution layer or immutable
-- core. Keep the pure selector for API compatibility, but disable every
-- archive probe/mount/chainload path and clean stale updater artifacts safely.
local Semver = require("src.update.Semver")
local Boot = {}
local PAYLOAD_DIR = "updates"
local PENDING = "updates/pending.txt"

local function isPayloadName(name)
  return type(name) == "string"
    and name:match("^gen1recomp%-%d+%.%d+%.%d+[%w%.%-]*%.love$") ~= nil
end

function Boot.probePayload(_rel)
  return nil, "writable updater payload execution is disabled by the native execution layer"
end

function Boot.select(candidates, bundledEngine, bundledShell)
  local chosen
  for _, candidate in ipairs(candidates or {}) do
    local newer = type(candidate.engine) == "string"
      and Semver.compare(candidate.engine, bundledEngine) > 0
    local runnable = (tonumber(candidate.minShell) or 1) <= bundledShell
    if newer and runnable
        and (not chosen or Semver.compare(candidate.engine, chosen.engine) > 0) then
      chosen = candidate
    end
  end
  local toDelete = {}
  for _, candidate in ipairs(candidates or {}) do
    if type(candidate.name) == "string" and not (chosen and candidate.name == chosen.name)
        and type(candidate.engine) == "string" then
      local stale = Semver.compare(candidate.engine, bundledEngine) <= 0
      if chosen and Semver.compare(candidate.engine, chosen.engine) <= 0 then stale = true end
      if stale then toDelete[#toDelete + 1] = candidate.name end
    end
  end
  return chosen and chosen.name or nil, toDelete
end

local function remove(path)
  if type(path) == "string" then pcall(love.filesystem.remove, path) end
end

function Boot.run(_args)
  local removed = 0
  local okPendingInfo, pendingInfo = pcall(love.filesystem.getInfo, PENDING, "file")
  local okPending, pending = false, nil
  if okPendingInfo and pendingInfo then
    okPending, pending = pcall(love.filesystem.read, PENDING)
  end
  if okPending and type(pending) == "string" then
    pending = pending:gsub("%s+$", "")
    if isPayloadName(pending) then
      remove(PAYLOAD_DIR .. "/" .. pending)
      removed = removed + 1
    end
  end
  remove(PENDING)

  local okInfo, info = pcall(love.filesystem.getInfo, PAYLOAD_DIR, "directory")
  if okInfo and info then
    local okItems, items = pcall(love.filesystem.getDirectoryItems, PAYLOAD_DIR)
    if okItems and type(items) == "table" then
      for _, name in ipairs(items) do
        if isPayloadName(name) then
          remove(PAYLOAD_DIR .. "/" .. name)
          removed = removed + 1
        end
      end
    end
  end
  _G.POKEPORT_PAYLOAD_MOUNTED = nil
  if removed > 0 then
    print("[gen1-layer:update-policy] removed " .. removed
      .. " disabled writable updater payload(s)")
  end
  return false
end

return Boot
`)
}

function patchConf(bytes: Uint8Array): Uint8Array {
  return encodeUtf8(replaceOnce(decodeUtf8(bytes),
    `  else
    t.window.resizable = true
  end
end
`,
    `  else
    t.window.resizable = true
    if osName == "Web" then
      -- iPhone CSS viewports are narrower than the desktop launcher's floor.
      t.window.minwidth = 320
      t.window.minheight = 320
    end
  end
end
`, "Web viewport minimum"))
}

const PATCHERS: Record<string, (bytes: Uint8Array) => Uint8Array> = {
  "main.lua": patchMain,
  "src/mods/Loader.lua": patchLoader,
  "src/core/SaveData.lua": patchSaveData,
  "src/mods/AssetTransform.lua": patchAssetTransform,
  "src/debug/SwitchDiagnostics.lua": patchSwitchDiagnostics,
  "src/import/CacheFs.lua": patchCache,
  "src/core/TouchControls.lua": patchTouch,
  "src/core/Music.lua": patchMusic,
  "src/update/Boot.lua": patchUpdateBoot,
  "conf.lua": patchConf,
}

export const EXECUTION_LAYER_REVISION = 9

export type CompatibilityLayerContract = {
  layerVersion: string
  suiteMinimum: string
  coreVersion: string
  coreSha256: string
}

function luaString(value: string): string {
  return JSON.stringify(value)
}

function compatibilityConfBootstrap(contract: CompatibilityLayerContract, coreBytes: number): Uint8Array {
  const source = `-- Gen1Recomp Native Suite execution-layer bootstrap.
-- The verified upstream core remains a separate, byte-exact archive. This
-- source archive is searched first; the core is mounted from host-owned MEMFS
-- only after its exact size and SHA-256 have been checked again inside LÖVE.
local CONTRACT = {
  schema = 1,
  layerVersion = ${luaString(contract.layerVersion)},
  revision = ${EXECUTION_LAYER_REVISION},
  coreVersion = ${luaString(contract.coreVersion)},
  coreSha256 = ${luaString(contract.coreSha256.toLowerCase())},
  coreBytes = ${coreBytes},
  corePath = "/gen1recomp-core.love",
}

local function layerError(code, detail)
  error("[gen1-layer:" .. code .. "] " .. tostring(detail), 0)
end

local handle, openError = io.open(CONTRACT.corePath, "rb")
if not handle then layerError("core-absent", openError or CONTRACT.corePath) end
local core = handle:read("*a")
handle:close()
if type(core) ~= "string" or #core ~= CONTRACT.coreBytes then
  layerError("core-size", "expected " .. CONTRACT.coreBytes .. ", received "
    .. tostring(type(core) == "string" and #core or "unreadable"))
end

local okData, dataModule = pcall(require, "love.data")
if not okData or not dataModule then layerError("hash-module", dataModule) end
local digest = dataModule.encode("string", "hex", dataModule.hash("sha256", core))
if type(digest) ~= "string" or digest:lower() ~= CONTRACT.coreSha256 then
  layerError("core-digest", "expected " .. CONTRACT.coreSha256 .. ", received "
    .. tostring(digest))
end

local coreFile = love.filesystem.newFileData(core, "gen1recomp-core.love")
core = nil
collectgarbage("collect")
if not coreFile or not love.filesystem.mount(coreFile, "", true) then
  layerError("core-mount", "verified archive could not be mounted")
end
-- Keep FileData alive for PhysFS' in-memory mount lifetime.
_G.GEN1RECOMP_EXECUTION_LAYER = {
  schema = CONTRACT.schema,
  version = CONTRACT.layerVersion,
  revision = CONTRACT.revision,
  coreVersion = CONTRACT.coreVersion,
  coreSha256 = CONTRACT.coreSha256,
  coreFile = coreFile,
  state = "mounted",
}

local upstreamConf, confError = love.filesystem.load("compat/core-conf.lua")
if not upstreamConf then layerError("conf-load", confError) end
upstreamConf()
if type(love.conf) ~= "function" then layerError("conf-contract", "core conf did not define love.conf") end
local applyCoreConf = love.conf
love.conf = function(t)
  applyCoreConf(t)
  -- LÖVE otherwise prepends the writable identity after love.conf. Keeping it
  -- appended makes the signed layer source and appended immutable core win
  -- over stale save-directory code while preserving ordinary save writes.
  t.appendidentity = true
  t.modules.data = true
end
print("[gen1-layer] mounted layer=" .. CONTRACT.layerVersion
  .. " revision=" .. CONTRACT.revision .. " core=" .. CONTRACT.coreVersion
  .. " sha256=" .. CONTRACT.coreSha256)
`
  return encodeUtf8(source)
}

function compatibilityMainBootstrap(contract: CompatibilityLayerContract): Uint8Array {
  const source = `-- Gen1Recomp Native Suite execution-layer entry broker.
local active = _G.GEN1RECOMP_EXECUTION_LAYER
if type(active) ~= "table" or active.schema ~= 1
    or active.version ~= ${luaString(contract.layerVersion)}
    or active.revision ~= ${EXECUTION_LAYER_REVISION}
    or active.coreVersion ~= ${luaString(contract.coreVersion)}
    or active.coreSha256 ~= ${luaString(contract.coreSha256.toLowerCase())}
    or active.state ~= "mounted" then
  error("[gen1-layer:activation] execution-layer contract is absent or incompatible", 0)
end

-- A writable save tree must never shadow executable compatibility modules.
local saveDirectory = love.filesystem.getSaveDirectory()
for _, path in ipairs({
  "src/mods/Loader.lua",
  "src/core/SaveData.lua",
  "src/mods/AssetTransform.lua",
  "src/debug/SwitchDiagnostics.lua",
  "src/import/CacheFs.lua",
  "src/core/TouchControls.lua",
  "src/core/Music.lua",
  "src/update/Boot.lua",
  "bit.lua",
}) do
  local real = love.filesystem.getRealDirectory(path)
  if not real or real == saveDirectory then
    error("[gen1-layer:precedence] untrusted writable path selected for " .. path, 0)
  end
end

local coreMain, loadError = love.filesystem.load("compat/core-main.lua")
if not coreMain then error("[gen1-layer:main-load] " .. tostring(loadError), 0) end
active.state = "executing"
print("[gen1-layer] precedence verified; entering immutable core")
return coreMain()
`
  return encodeUtf8(source)
}

export function createCompatibilityLayerLove(
  source: Uint8Array,
  bitModule: Uint8Array,
  contract: CompatibilityLayerContract,
): Uint8Array {
  if (!/^[A-Za-z0-9._+-]{1,64}$/.test(contract.layerVersion)
      || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(contract.suiteMinimum)
      || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(contract.coreVersion)
      || !/^[a-f0-9]{64}$/i.test(contract.coreSha256)) {
    throw new Error("The execution-layer contract is invalid.")
  }
  const entries = readLocalZip(source)
  if (entries.length === 0 || entries.length > 10_000) {
    throw new Error("The official engine package has an invalid entry count.")
  }
  const originals = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (entry.type === "symlink") throw new Error("The official engine package contains a symbolic link.")
    if (entry.type !== "file") continue
    if (originals.has(entry.path)) throw new Error(`Duplicate official engine path: ${entry.path}`)
    if (PATCHERS[entry.path] != null) {
      originals.set(entry.path, extractLocalZipEntry(source, entry))
    }
  }
  for (const required of Object.keys(PATCHERS)) {
    if (!originals.has(required)) throw new Error(`The official engine package is missing ${required}.`)
  }
  if (entries.some(entry => entry.path === "bit.lua")) {
    throw new Error("The official engine unexpectedly already includes bit.lua.")
  }

  const payloads = new Map<string, Uint8Array>()
  for (const [path, patcher] of Object.entries(PATCHERS)) {
    const original = originals.get(path) as Uint8Array
    const layerPath = path === "main.lua" ? "compat/core-main.lua"
      : path === "conf.lua" ? "compat/core-conf.lua" : path
    payloads.set(layerPath, patcher(original))
  }
  payloads.set("main.lua", compatibilityMainBootstrap(contract))
  payloads.set("conf.lua", compatibilityConfBootstrap(contract, source.length))
  payloads.set("bit.lua", bitModule)

  const fileRecords = [...payloads.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256Hex(bytes) }))
  const manifest = {
    schema: 1,
    id: "gen1recomp-execution-layer",
    version: contract.layerVersion,
    suiteMinimum: contract.suiteMinimum,
    enginePatchRevision: EXECUTION_LAYER_REVISION,
    layer: {
      id: "gen1recomp-execution-layer",
      version: contract.layerVersion,
      suiteMinimum: contract.suiteMinimum,
      revision: EXECUTION_LAYER_REVISION,
    },
    core: {
      version: contract.coreVersion,
      sha256: contract.coreSha256.toLowerCase(),
      bytes: source.length,
      immutable: true,
    },
    upstreamCore: {
      version: contract.coreVersion,
      sha256: contract.coreSha256.toLowerCase(),
      bytes: source.length,
      immutable: true,
      hostPath: "/gen1recomp-core.love",
    },
    build: {
      deterministic: true,
      output: "source-layer-only",
      timestamps: "1980-01-01T00:00:00Z",
    },
    execution: {
      source: "layer",
      coreMount: "verified-memory-appended",
      saveIdentity: "appended-non-executable",
      updater: "host-verified-components-only",
      entryBroker: "compat/core-main.lua",
      confBroker: "compat/core-conf.lua",
    },
    overlayTargets: Object.keys(PATCHERS).concat("bit.lua").sort(),
    requiredCapabilities: {
      lua: "5.1",
      love: "11.5",
      threads: false,
      chunkTransport: 1,
      dynamicModOptions: 2,
      caughtAlertPolicy: 1,
      executionLayer: 1,
      immutableCoreMemoryMount: 1,
      hostVerifiedUpdates: 1,
    },
    files: fileRecords,
  }
  payloads.set("layer-manifest.json", encodeUtf8(`${JSON.stringify(manifest, null, 2)}\n`))

  let total = 0
  const files: RepackedZipFile[] = [...payloads.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => {
      total += bytes.length
      if (total > 4 * 1024 * 1024) throw new Error("The execution layer exceeds 4 MiB.")
      return {
        path,
        method: 0,
        compressedBytes: bytes,
        uncompressedSize: bytes.length,
        crc32: zipCrc32(bytes),
      }
    })
  return createRepackedZip(files)
}

export function patchOfficialEngineLove(source: Uint8Array, bitModule: Uint8Array): Uint8Array {
  const entries = readLocalZip(source)
  if (entries.length === 0 || entries.length > 10_000) throw new Error("The official engine package has an invalid entry count.")
  const files: RepackedZipFile[] = []
  const seen = new Set<string>()
  let total = 0
  for (const entry of entries) {
    if (entry.type === "symlink") throw new Error("The official engine package contains a symbolic link.")
    if (entry.type !== "file") continue
    if (seen.has(entry.path)) throw new Error(`Duplicate official engine path: ${entry.path}`)
    seen.add(entry.path)
    const original = extractLocalZipEntry(source, entry) // validates DEFLATE and CRC before reuse
    const patcher = PATCHERS[entry.path]
    const patched = patcher == null ? null : patcher(original)
    total += patched?.length ?? original.length
    if (total > 64 * 1024 * 1024) throw new Error("The expanded official engine package exceeds 64 MiB.")
    files.push(patched == null ? {
      path: entry.path,
      method: entry.method,
      compressedBytes: source.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize),
      uncompressedSize: entry.uncompressedSize,
      crc32: entry.crc32,
    } : {
      path: entry.path,
      method: 0,
      compressedBytes: patched,
      uncompressedSize: patched.length,
      crc32: zipCrc32(patched),
    })
  }
  for (const required of Object.keys(PATCHERS)) {
    if (!seen.has(required)) throw new Error(`The official engine package is missing ${required}.`)
  }
  if (seen.has("bit.lua")) throw new Error("The official engine unexpectedly already includes bit.lua.")
  files.push({
    path: "bit.lua",
    method: 0,
    compressedBytes: bitModule,
    uncompressedSize: bitModule.length,
    crc32: zipCrc32(bitModule),
  })
  return createRepackedZip(files)
}
