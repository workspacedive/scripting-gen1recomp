import { readFileSync } from "node:fs"
import vm from "node:vm"

const source = readFileSync(new URL("../runtime/binary-transport.js", import.meta.url), "utf8")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function context(specs) {
  const writes = []
  const events = []
  const window = {
    Gen1Launch: { binaryTransport: { schema: 1, ...specs } },
    Gen1Diagnostics: { emit: (...values) => events.push(values) },
  }
  const sandbox = {
    window,
    Uint8Array,
    Number,
    Array,
    Object,
    Error,
    atob: value => Buffer.from(value, "base64").toString("latin1"),
    document: { write: value => writes.push(value) },
  }
  vm.runInNewContext(source, sandbox, { filename: "binary-transport.js" })
  return { transport: window.Gen1BinaryTransport, writes, events }
}

const valid = context({
  wasm: { bytes: 5, files: ["binary-wasm-0000.js", "binary-wasm-0001.js"] },
  package: { bytes: 4, files: ["binary-package-0000.js"] },
})
assert(valid.writes.length === 3, "Every declared chunk script was not requested")
assert(valid.writes[0].includes("binary-wasm-0000.js") && valid.writes[2].includes("binary-package-0000.js"),
  "Chunk scripts were not requested in deterministic WASM/package order")
valid.transport.append("wasm", 0, 0, 3, Buffer.from([0, 97, 115]).toString("base64"))
valid.transport.append("wasm", 1, 3, 2, Buffer.from([109, 1]).toString("base64"))
valid.transport.append("package", 0, 0, 4, Buffer.from([9, 8, 7, 6]).toString("base64"))
assert(valid.transport.status("wasm").bytes === 5 && valid.transport.status("wasm").chunks === 2,
  "Completed transport status was incorrect")
assert([...valid.transport.take("wasm")].join(",") === "0,97,115,109,1", "WASM chunk bytes were not reconstructed exactly")
assert([...valid.transport.take("package")].join(",") === "9,8,7,6", "Package chunk bytes were not reconstructed exactly")
assert(valid.transport.status("package").taken === true, "Taken package storage was not marked releasable")

let rejected = false
try { valid.transport.take("package") } catch { rejected = true }
assert(rejected, "A second take was accepted")

const outOfOrder = context({
  wasm: { bytes: 1, files: ["binary-wasm-0000.js"] },
  package: { bytes: 1, files: ["binary-package-0000.js"] },
})
rejected = false
try { outOfOrder.transport.append("wasm", 1, 0, 1, "AA==") } catch { rejected = true }
assert(rejected, "An out-of-order chunk was accepted")
rejected = false
try { outOfOrder.transport.take("wasm") } catch { rejected = true }
assert(rejected, "An incomplete transport was accepted")

rejected = false
try {
  context({
    wasm: { bytes: 0, files: ["https://evil.example/payload.js"] },
    package: { bytes: 0, files: [] },
  })
} catch { rejected = true }
assert(rejected, "An external chunk script name was accepted")

console.log("Bounded binary transport tests passed")
