const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const nextBin = require.resolve("next/dist/bin/next");
const nextArgs = process.argv.slice(2);
const serverDir = path.join(rootDir, ".next", "server");
const chunksDir = path.join(serverDir, "chunks");

function mirrorServerChunks() {
  if (!fs.existsSync(chunksDir) || !fs.existsSync(serverDir)) {
    return;
  }

  const entries = fs.readdirSync(chunksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }

    const sourcePath = path.join(chunksDir, entry.name);
    const targetPath = path.join(serverDir, entry.name);

    try {
      const sourceStat = fs.statSync(sourcePath);
      const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
      const shouldCopy =
        !targetStat ||
        targetStat.size !== sourceStat.size ||
        targetStat.mtimeMs < sourceStat.mtimeMs;

      if (shouldCopy) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    } catch (error) {
      console.warn(`[chunk-mirror] Failed to mirror ${entry.name}:`, error.message);
    }
  }
}

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

const interval = setInterval(mirrorServerChunks, 500);
mirrorServerChunks();

function shutdown(code) {
  clearInterval(interval);
  process.exit(code);
}

child.on("exit", (code) => shutdown(code ?? 0));
child.on("error", (error) => {
  clearInterval(interval);
  console.error("[chunk-mirror] Failed to start Next.js:", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(interval);
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
