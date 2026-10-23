import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');

export async function generateProjectZip(outputPath?: string): Promise<string> {
  const rootDir = process.cwd();
  const targetZipPath = outputPath || path.join(rootDir, 'ReserveFlow-Complete.zip');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetZipPath);
    const archive = new ZipArchive({
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      console.log(`ReserveFlow-Complete.zip created: ${archive.pointer()} total bytes at ${targetZipPath}`);
      resolve(targetZipPath);
    });

    archive.on('warning', (err: any) => {
      if (err.code === 'ENOENT') {
        console.warn(err);
      } else {
        reject(err);
      }
    });

    archive.on('error', (err: any) => {
      reject(err);
    });

    archive.pipe(output);

    // List of files and folders to include
    const includeDirs = ['src', 'drizzle', 'docs', '.github', 'scripts'];
    const includeFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'drizzle.config.ts',
      'vitest.config.ts',
      'index.html',
      'server.ts',
      'Dockerfile',
      'compose.yaml',
      '.dockerignore',
      '.env.example',
      '.gitignore',
      'metadata.json',
      'README.md',
      'AI_USAGE.md',
    ];

    for (const dir of includeDirs) {
      const fullDir = path.join(rootDir, dir);
      if (fs.existsSync(fullDir)) {
        archive.directory(fullDir, `reserveflow/${dir}`);
      }
    }

    for (const file of includeFiles) {
      const fullFile = path.join(rootDir, file);
      if (fs.existsSync(fullFile)) {
        archive.file(fullFile, { name: `reserveflow/${file}` });
      }
    }

    archive.finalize();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateProjectZip()
    .then((p) => {
      console.log('ZIP packaging complete:', p);
      process.exit(0);
    })
    .catch((err) => {
      console.error('ZIP packaging failed:', err);
      process.exit(1);
    });
}
