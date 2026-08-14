-- Pure-Lua 5.1 compatibility subset for Lua BitOp's `bit` module.
-- Used by the browser/LÖVE WebAssembly build, whose Lua VM has no LuaJIT.
local M = {}
local TWO32, TWO31 = 4294967296, 2147483648
local function uint(n)
  n = tonumber(n) or 0
  n = n % TWO32
  if n < 0 then n = n + TWO32 end
  return math.floor(n)
end
local function signed(n)
  n = uint(n)
  if n >= TWO31 then return n - TWO32 end
  return n
end
local AND, OR, XOR = {}, {}, {}
for a = 0, 15 do
  for b = 0, 15 do
    local aa, bb, p, va, vo, vx = a, b, 1, 0, 0, 0
    for _ = 1, 4 do
      local x, y = aa % 2, bb % 2
      if x == 1 and y == 1 then va = va + p end
      if x == 1 or y == 1 then vo = vo + p end
      if x ~= y then vx = vx + p end
      aa, bb, p = math.floor(aa / 2), math.floor(bb / 2), p * 2
    end
    local i = a * 16 + b
    AND[i], OR[i], XOR[i] = va, vo, vx
  end
end
local function pair(a, b, lookup)
  a, b = uint(a), uint(b)
  local out, p = 0, 1
  for _ = 1, 8 do
    local x, y = a % 16, b % 16
    out = out + lookup[x * 16 + y] * p
    a, b, p = math.floor(a / 16), math.floor(b / 16), p * 16
  end
  return out
end
local function fold(lookup, a, ...)
  local out = uint(a)
  for i = 1, select('#', ...) do out = pair(out, select(i, ...), lookup) end
  return signed(out)
end
function M.band(a, ...) return fold(AND, a, ...) end
function M.bor(a, ...) return fold(OR, a, ...) end
function M.bxor(a, ...) return fold(XOR, a, ...) end
function M.bnot(a) return signed(TWO32 - 1 - uint(a)) end
function M.lshift(a, n)
  n = uint(n) % 32
  return signed((uint(a) % (2 ^ (32 - n))) * (2 ^ n))
end
function M.rshift(a, n)
  n = uint(n) % 32
  return signed(math.floor(uint(a) / (2 ^ n)))
end
function M.arshift(a, n)
  n = uint(n) % 32
  local v = signed(a)
  if v < 0 then return signed(math.floor(v / (2 ^ n))) end
  return signed(math.floor(v / (2 ^ n)))
end
function M.tobit(a) return signed(a) end
return M
