# Skills Definition: Scripting iOS App & Gen1Recomp Architecture

## Available Skills

### 1. TSX UI & Native iOS Component Development
- **Description**: Build responsive mobile interfaces, widgets, Control Center modules, and Dynamic Island views using TSX syntax and SwiftUI components in the Scripting iOS App framework.
- **Parameters**: `componentType` (widget, page, notification, modal), `stateSchema`, `localization`.
- **Constraint**: Strict adherence to free-tier APIs and local state synchronization.

### 2. Cryptographic Integrity & Manifest Management
- **Description**: Compute, verify, and update SHA-256 hashes for project files and maintain `MANIFEST.sha256` alignment.
- **Parameters**: `targetDirectory`, `manifestPath`.
- **Verification**: Zero discrepancies between disk state and manifest hashes.

### 3. Local-First ZIP Archive & Mod Packaging
- **Description**: Inspect, extract, validate, and repackage ZIP archives (`.scripting`, mods) using self-contained pure-JS/Python ZIP utilities without host archive primitive bottlenecks.
- **Parameters**: `archivePath`, `outputDir`, `entryFilter`.
- **Constraint**: Guard against path traversal, symlinks, and oversized payloads (`MAX_MOD_TOTAL_BYTES`).

### 4. Diagnostic Logging & Error Telemetry
- **Description**: Capture, batch, rotate, and export structured console logs, Lua tracebacks, and telemetry events across native and Web runtime boundaries.
- **Parameters**: `format` (TXT, JSON, JSONL, CSV), `redactSensitiveData`.
- **Constraint**: Exclude ROM filenames, hashes, and binary payloads from diagnostic contexts.

### 5. Cross-Platform Runtime Patching & Execution Layer
- **Description**: Manage immutable upstream cores (`gen1recomp-core-0.1.78.love`) alongside versioned executable compatibility layers with transactional rollback and fallback.
- **Parameters**: `corePath`, `layerVersion`, `patchTarget`.
- **Constraint**: Maintain source-first precedence and read-only upstream guarantees.
