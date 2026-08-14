
var Module;

if (typeof Module === 'undefined') Module = eval('(function() { try { return Module || {} } catch(e) { return {} } })()');

if (!Module.expectedDataFileDownloads) {
  Module.expectedDataFileDownloads = 0;
  Module.finishedDataFileDownloads = 0;
}
Module.expectedDataFileDownloads++;
(function() {
 function diagnostic(level, event, message) {
  try {
   if (window.Gen1Diagnostics && typeof window.Gen1Diagnostics.emit === 'function') {
    window.Gen1Diagnostics.emit('package', level, event, message);
   }
  } catch (_) {}
 }
 function failureText(error) {
  try {
   if (window.Gen1Diagnostics && typeof window.Gen1Diagnostics.valueText === 'function') return window.Gen1Diagnostics.valueText(error);
   return error instanceof Error ? error.name + ': ' + error.message + (error.stack ? '\n' + error.stack : '') : String(error);
  } catch (_) { return '[Unprintable package failure]'; }
 }
 var loadPackage = function(metadata) {

  var PACKAGE_PATH;
  if (typeof window === 'object') {
    PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
  } else if (typeof location !== 'undefined') {
      // worker
      PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
    } else {
      throw 'using preloaded data can only be done on a web page or in a web worker';
    }
    var PACKAGE_NAME = 'game.data';
    var REMOTE_PACKAGE_BASE = 'game.data';
    if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
      Module['locateFile'] = Module['locateFilePackage'];
      Module.printErr('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
    }
    var REMOTE_PACKAGE_NAME = typeof Module['locateFile'] === 'function' ?
    Module['locateFile'](REMOTE_PACKAGE_BASE) :
    ((Module['filePackagePrefixURL'] || '') + REMOTE_PACKAGE_BASE);

    var REMOTE_PACKAGE_SIZE = metadata.remote_package_size;
    var PACKAGE_UUID = metadata.package_uuid;

    function fetchRemotePackage(packageName, packageSize, callback, errback) {
      var buffer;
      try {
        var launch = window.Gen1Launch;
        var transport = window.Gen1BinaryTransport;
        if (launch && launch.binaryTransport && transport && typeof transport.take === 'function') {
          diagnostic('info', 'package_transport_take_begin', 'expectedBytes=' + packageSize);
          var injected = transport.take('package');
          if (!(injected instanceof Uint8Array) || injected.byteLength !== packageSize) {
            throw new Error('The bounded native package does not match its validated metadata.');
          }
          buffer = injected.buffer;
          diagnostic('info', 'package_transport_take_complete', 'bytes=' + injected.byteLength);
          injected = null;
        } else {
          // Read-only compatibility for launch envelopes produced before 3.4.
          if (!launch || typeof launch.packageBase64 !== 'string') {
            throw new Error('The native package injection is missing.');
          }
          var encoded = launch.packageBase64;
          diagnostic('warning', 'legacy_base64_decode_begin', 'base64Characters=' + encoded.length + ' expectedBytes=' + packageSize);
          var raw;
          try { raw = atob(encoded); }
          finally { launch.packageBase64 = ''; encoded = ''; }
          var bytes = new Uint8Array(raw.length);
          for (var index = 0; index < raw.length; ++index) bytes[index] = raw.charCodeAt(index);
          if (bytes.length !== packageSize) throw new Error('The native package size does not match its validated metadata.');
          diagnostic('info', 'legacy_base64_decode_complete', 'bytes=' + bytes.length);
          buffer = bytes.buffer;
        }
      } catch (error) {
        diagnostic('fatal', 'package_transport_failed', failureText(error));
        errback(error);
        return;
      }
      try {
        callback(buffer);
      } catch (error) {
        diagnostic('fatal', 'package_process_failed', failureText(error));
        errback(error);
      }
    };

    function handleError(error) {
      var detail = failureText(error);
      diagnostic('fatal', 'package_error', detail);
      console.error('package error:', error);
      if (typeof window.Gen1RecompReportAlert === 'function') window.Gen1RecompReportAlert(detail);
    };

    function runWithFS() {
      diagnostic('info', 'filesystem_prepare_begin', 'Removing stale native mod injection trees.');

      // The mod directory lives under IDBFS. Remove the previous injected copy
      // before recreating the native library so deleted/updated mods cannot
      // survive as stale browser files.
      function removeTree(path) {
        var fs = Module['FS'];
        if (!fs) return;
        var stat;
        try { stat = fs.stat(path); } catch (_) { return; }
        if (fs.isDir(stat.mode)) {
          var names = fs.readdir(path);
          for (var n = 0; n < names.length; ++n) {
            if (names[n] !== '.' && names[n] !== '..') removeTree(path + '/' + names[n]);
          }
          try { fs.rmdir(path); } catch (_) {}
        } else {
          try { fs.unlink(path); } catch (_) {}
        }
      }
      removeTree('/home/web_user/love/pokemon-love2d/mods');
      removeTree('/home/web_user/love/pokemon-love2d/native-mod-packages');
      diagnostic('info', 'filesystem_prepare_complete', 'Stale native mod injection trees were removed when present.');

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }
      

      function DataRequest(start, end, crunched, audio) {
        this.start = start;
        this.end = end;
        this.crunched = crunched;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function(mode, name) {
          this.name = name;
          this.requests[name] = this;
          Module['addRunDependency']('fp ' + this.name);
        },
        send: function() {},
        onload: function() {
          var byteArray = this.byteArray.subarray(this.start, this.end);

          this.finish(byteArray);

        },
        finish: function(byteArray) {
          var that = this;

        var slash = this.name.lastIndexOf('/');
        if (slash > 0) Module['FS_createPath']('/', this.name.substring(1, slash), true, true);
        try { Module['FS_unlink'](this.name); } catch (e) {}
        Module['FS_createDataFile'](this.name, null, byteArray, true, true, true); // canOwn this data in the filesystem
        diagnostic('debug', 'file_injected', this.name + ' bytes=' + byteArray.length);
        Module['removeRunDependency']('fp ' + that.name);

        this.requests[this.name] = null;
      }
    };

    var files = metadata.files;
    for (var requestIndex = 0; requestIndex < files.length; ++requestIndex) {
      new DataRequest(files[requestIndex].start, files[requestIndex].end, files[requestIndex].crunched, files[requestIndex].audio).open('GET', files[requestIndex].filename);
    }


    function processPackageData(arrayBuffer) {
      Module.finishedDataFileDownloads++;
      assert(arrayBuffer, 'Loading data file failed.');
      assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
      var byteArray = new Uint8Array(arrayBuffer);
      diagnostic('info', 'package_process_begin', 'bytes=' + byteArray.length + ' files=' + metadata.files.length);
      var curr;

        // copy the entire loaded file into a spot in the heap. Files will refer to slices in that. They cannot be freed though
        // (we may be allocating before malloc is ready, during startup).
        if (Module['SPLIT_MEMORY']) Module.printErr('warning: you should run the file packager with --no-heap-copy when SPLIT_MEMORY is used, otherwise copying into the heap may fail due to the splitting');
        var ptr = Module['getMemory'](byteArray.length);
        Module['HEAPU8'].set(byteArray, ptr);
        DataRequest.prototype.byteArray = Module['HEAPU8'].subarray(ptr, ptr+byteArray.length);

        var files = metadata.files;
        for (var fileIndex = 0; fileIndex < files.length; ++fileIndex) {
          DataRequest.prototype.requests[files[fileIndex].filename].onload();
        }
        diagnostic('info', 'package_process_complete', 'bytes=' + byteArray.length + ' files=' + files.length);
        Module['removeRunDependency']('datafile_game.data');

      };
      Module['addRunDependency']('datafile_game.data');

      if (!Module.preloadResults) Module.preloadResults = {};
      Module.preloadResults[PACKAGE_NAME] = {fromCache: false};
      console.info('loading native-injected game package');
      fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE,
        processPackageData, handleError);

      if (Module['setStatus']) Module['setStatus']('Downloading...');

    }
    if (Module['calledRun']) {
      runWithFS();
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

  }
  try {
    if (!window.Gen1Launch || !window.Gen1Launch.packageMetadata) {
      throw new Error('The native package metadata is missing.');
    }
    var packageMetadata = window.Gen1Launch.packageMetadata;
    if (!Array.isArray(packageMetadata.files) || !Number.isSafeInteger(packageMetadata.remote_package_size)
        || packageMetadata.remote_package_size < 0) {
      throw new Error('The native package metadata is malformed.');
    }
    diagnostic('info', 'metadata', JSON.stringify({
      packageBytes: packageMetadata.remote_package_size,
      files: packageMetadata.files.length,
      packageUUID: packageMetadata.package_uuid || null
    }));
    loadPackage(packageMetadata);
  } catch (error) {
    var detail = failureText(error);
    diagnostic('fatal', 'package_bootstrap_failed', detail);
    console.error('package bootstrap error:', error);
    if (typeof window.Gen1RecompReportAlert === 'function') window.Gen1RecompReportAlert(detail);
    throw error;
  }

})();
