(function () {
  'use strict';

  var launch = window.Gen1Launch;
  var contract = launch && launch.binaryTransport;
  if (!contract || contract.schema !== 1) {
    throw new Error('The bounded binary transport contract is missing.');
  }

  function emit(level, event, message) {
    try {
      if (window.Gen1Diagnostics && typeof window.Gen1Diagnostics.emit === 'function') {
        window.Gen1Diagnostics.emit('transport', level, event, message);
      }
    } catch (_) {}
  }

  function safeSpec(kind) {
    var spec = contract[kind];
    if (!spec || !Number.isSafeInteger(spec.bytes) || spec.bytes < 0
        || spec.bytes > 1024 * 1024 * 1024 || !Array.isArray(spec.files)
        || spec.files.length > 4096) {
      throw new Error('Invalid binary transport specification for ' + kind + '.');
    }
    var pattern = new RegExp('^binary-' + kind + '-[0-9]{4}\\.js$');
    var seen = Object.create(null);
    for (var index = 0; index < spec.files.length; ++index) {
      var name = spec.files[index];
      if (typeof name !== 'string' || !pattern.test(name) || seen[name]) {
        throw new Error('Invalid local binary transport script for ' + kind + '.');
      }
      seen[name] = true;
    }
    if ((spec.bytes === 0) !== (spec.files.length === 0)) {
      throw new Error('Empty binary transport specification mismatch for ' + kind + '.');
    }
    return spec;
  }

  function makeState(kind) {
    var spec = safeSpec(kind);
    return {
      kind: kind,
      expectedBytes: spec.bytes,
      expectedChunks: spec.files.length,
      nextIndex: 0,
      offset: 0,
      bytes: new Uint8Array(spec.bytes),
      taken: false,
      files: spec.files.slice(),
    };
  }

  var states = {
    wasm: makeState('wasm'),
    package: makeState('package'),
  };

  function stateFor(kind) {
    var state = states[kind];
    if (!state) throw new Error('Unknown binary transport kind: ' + String(kind));
    return state;
  }

  var transport = {
    append: function (kind, index, offset, declaredBytes, base64) {
      var state = stateFor(kind);
      if (state.taken || state.bytes === null) throw new Error('Binary transport storage was already released.');
      if (!Number.isSafeInteger(index) || index !== state.nextIndex) {
        throw new Error('Out-of-order binary transport chunk for ' + kind + '.');
      }
      if (!Number.isSafeInteger(offset) || offset !== state.offset
          || !Number.isSafeInteger(declaredBytes) || declaredBytes < 0
          || typeof base64 !== 'string') {
        throw new Error('Invalid binary transport chunk metadata for ' + kind + '.');
      }
      var raw = atob(base64);
      if (raw.length !== declaredBytes || offset + raw.length > state.expectedBytes) {
        throw new Error('Binary transport chunk length mismatch for ' + kind + '.');
      }
      for (var cursor = 0; cursor < raw.length; ++cursor) {
        state.bytes[offset + cursor] = raw.charCodeAt(cursor);
      }
      state.offset += raw.length;
      state.nextIndex += 1;
      emit('debug', 'chunk', kind + ' index=' + index + ' offset=' + offset + ' bytes=' + raw.length);
    },

    take: function (kind) {
      var state = stateFor(kind);
      if (state.taken || state.bytes === null) throw new Error('Binary transport payload was already consumed.');
      if (state.nextIndex !== state.expectedChunks || state.offset !== state.expectedBytes) {
        throw new Error('Incomplete binary transport payload for ' + kind + '.');
      }
      var result = state.bytes;
      state.bytes = null;
      state.taken = true;
      emit('info', 'taken', kind + ' bytes=' + result.byteLength + ' chunks=' + state.nextIndex);
      return result;
    },

    status: function (kind) {
      var state = stateFor(kind);
      return {
        bytes: state.offset,
        expectedBytes: state.expectedBytes,
        chunks: state.nextIndex,
        expectedChunks: state.expectedChunks,
        complete: state.offset === state.expectedBytes && state.nextIndex === state.expectedChunks,
        taken: state.taken,
      };
    },
  };

  window.Gen1BinaryTransport = transport;
  emit('info', 'initialized', 'wasmBytes=' + states.wasm.expectedBytes
    + ' packageBytes=' + states.package.expectedBytes);

  ['wasm', 'package'].forEach(function (kind) {
    var files = states[kind].files;
    for (var index = 0; index < files.length; ++index) {
      document.write('<script src="' + files[index] + '"></' + 'script>');
    }
  });
})();
