const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version, productName, name, main } = require('../package.json');

async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Use a Windows x64 machine to build this package.');
  }
  const root = path.resolve(__dirname, '..');
  const electronExe = require('electron');
  const runtime = path.dirname(electronExe);
  const output = path.join(root, 'dist');
  const basename = `${productName}-${version}-win-x64`;
  const destination = path.join(output, basename);
  const app = path.join(destination, 'resources', 'app');
  await fs.mkdir(output, { recursive: true });
  await fs.cp(runtime, destination, {
    recursive: true,
    filter: entry => !['electron.exe', 'electron_wer.dll', 'default_app.asar'].includes(path.basename(entry)),
  });
  await fs.copyFile(electronExe, path.join(destination, productName + '.exe'));
  const crashHelper = path.join(runtime, 'electron_wer.dll');
  await fs.copyFile(crashHelper, path.join(destination, productName + '_wer.dll')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  await fs.mkdir(app, { recursive: true });
  await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name, version, productName, main }, null, 2));
  await fs.cp(path.join(root, 'desktop'), path.join(app, 'desktop'), { recursive: true });

  const ui = path.join(app, 'prototype');
  await fs.mkdir(ui, { recursive: true });
  const source = path.join(root, 'prototype');
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    if (item.isFile() && (item.name === 'index.html' || /\.(?:css|js)$/.test(item.name))) {
      await fs.copyFile(path.join(source, item.name), path.join(ui, item.name));
    }
  }
  // Ship the sprite sheets used by the app. The editing references and GIF
  // previews are kept in the source project.
  const art = path.join(source, 'assets', 'yueya');
  for (const state of await fs.readdir(art, { withFileTypes: true })) {
    if (!state.isDirectory()) continue;
    const images = await fs.readdir(path.join(art, state.name));
    const target = path.join(ui, 'assets', 'yueya', state.name);
    await fs.mkdir(target, { recursive: true });
    for (const image of images.filter(file => /\.png$/.test(file))) {
      await fs.copyFile(path.join(art, state.name, image), path.join(target, image));
    }
  }

  const zip = path.join(output, basename + '.zip');
  execFileSync('tar.exe', ['-a', '-c', '-f', zip, '-C', output, basename], { stdio: 'inherit', windowsHide: true });
  console.log(zip);
}

build().catch(error => { console.error(error); process.exitCode = 1; });
