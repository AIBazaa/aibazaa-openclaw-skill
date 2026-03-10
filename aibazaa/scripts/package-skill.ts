import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist", "clawhub");
const VERSION = "1.0.0";
const OUTPUT_FILE = path.join(DIST_DIR, `aibazaa-skill-${VERSION}.tar.gz`);

const SKILL_FILES = [
  "SKILL.md",
  "README.md",
  "aibazaa-client.ts",
  "config.json",
  "package.json",
  "tsconfig.json",
];

type TarEntry = {
  name: string;
  content: Buffer;
  mode?: number;
};

function padOctal(value: number, size: number): string {
  return value.toString(8).padStart(size - 1, "0") + "\0";
}

function createTarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512, 0);

  const writeString = (input: string, offset: number, length: number) => {
    const value = Buffer.from(input, "utf8");
    value.copy(header, offset, 0, Math.min(value.length, length));
  };

  writeString(entry.name, 0, 100);
  writeString(padOctal(entry.mode ?? 0o644, 8), 100, 8);
  writeString(padOctal(0, 8), 108, 8);
  writeString(padOctal(0, 8), 116, 8);
  writeString(padOctal(entry.content.length, 12), 124, 12);
  writeString(padOctal(Math.floor(Date.now() / 1000), 12), 136, 12);

  for (let i = 148; i < 156; i += 1) {
    header[i] = 0x20;
  }

  header[156] = "0".charCodeAt(0);
  writeString("ustar\0", 257, 6);
  writeString("00", 263, 2);

  let checksum = 0;
  for (let i = 0; i < 512; i += 1) {
    checksum += header[i] ?? 0;
  }
  writeString(padOctal(checksum, 8), 148, 8);

  return header;
}

function makeTarArchive(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = createTarHeader(entry);
    chunks.push(header);
    chunks.push(entry.content);

    const remainder = entry.content.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

async function ensureFilesExist(): Promise<void> {
  for (const relativePath of SKILL_FILES) {
    const absolutePath = path.join(ROOT, relativePath);
    await stat(absolutePath);
  }
}

async function buildArchiveEntries(): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  for (const relativePath of SKILL_FILES) {
    const absolutePath = path.join(ROOT, relativePath);
    const content = await readFile(absolutePath);
    entries.push({
      name: `aibazaa/${relativePath}`,
      content,
    });
  }
  return entries;
}

async function main(): Promise<void> {
  await ensureFilesExist();

  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  const entries = await buildArchiveEntries();
  const tarBuffer = makeTarArchive(entries);

  const gzip = createGzip({ level: 9 });
  const source = Readable.from(tarBuffer);
  const chunks: Buffer[] = [];

  gzip.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  await pipeline(source, gzip);

  await writeFile(OUTPUT_FILE, Buffer.concat(chunks));

  console.log(`ClawHub package written to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Failed to package OpenClaw skill", error);
  process.exit(1);
});
