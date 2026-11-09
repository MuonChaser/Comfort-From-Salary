// Assemble generated keyframes into aligned runtime assets and animated exports.
// This script packages existing artwork; it does not redraw the character.
const sharp = require(process.env.CFS_SHARP_MODULE || 'sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const working = process.argv[2] === 'working';
const lunch = process.argv[2] === 'lunch';
const after = process.argv[2] === 'after';
const rest = process.argv[2] === 'rest';
const desk = working || lunch;
const state = rest ? 'rest' : after ? 'after' : lunch ? 'lunch' : working ? 'working' : 'before';
const stem = state === 'before' ? 'commute' : state;
const actionName = { rest: 'sunset-selfie', after: 'tumble-recover', lunch: 'eat-burp', working: 'desk-slam', before: 'doze-recover' }[state];
const source = path.join(root, `art/yueya/${stem}-sheet-clean-v2.png`);
const destination = path.join(root, `prototype/assets/yueya/${state}`);
const size = 512;
const idle = { frames: [0, 1, 2, 3, 2, 1], delays: [500, 500, 500, 500, 500, 500] };
const action = { frames: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], delays: [280, 340, 460, 140, 130, 140, 140, 160, 230, 380, 300, 350] };
if (working) action.delays = [240, 240, 240, 200, 200, 90, 80, 90, 160, 300, 340, 420];
if (lunch) action.delays = [220, 180, 240, 180, 240, 200, 320, 350, 380, 450, 350, 800];
if (after) action.delays = [300, 170, 110, 170, 450, 230, 240, 310, 360, 300, 400, 560];
if (rest) action.delays = [230, 250, 250, 300, 350, 110, 470, 340, 280, 250, 220, 450];
// Match the sofa's right side, away from the moving character, to frame 1.
function sofaOffset(data, reference) {
  let best = { dx: 0, dy: 0, error: Infinity };
  function score(dx, dy) {
    let error = 0;
    for (let y = 120; y < 440; y += 4) for (let x = 415; x < 506; x += 4) {
      const a = (y * size + x) * 4, sx = x - dx;
      const b = sx >= 0 && sx < size ? ((y - dy) * size + sx) * 4 : -4;
      const opaqueA = reference[a + 3] > 180, opaqueB = b >= 0 && data[b + 3] > 180;
      if (opaqueA !== opaqueB) error += 255;
      else if (opaqueA) error += Math.abs(reference[a] - data[b]) + Math.abs(reference[a + 1] - data[b + 1]) + Math.abs(reference[a + 2] - data[b + 2]);
    }
    if (error < best.error) best = { dx, dy, error };
  }
  for (let dy = -24; dy <= 24; dy += 3) for (let dx = -24; dx <= 24; dx += 3) score(dx, dy);
  const coarse = best;
  for (let dy = coarse.dy - 2; dy <= coarse.dy + 2; dy++) for (let dx = coarse.dx - 2; dx <= coarse.dx + 2; dx++) score(dx, dy);
  return best;
}
function railAnchor(data) {
  let best = { count: 0, x: size / 2, y: 50 };
  const scanlines = [];
  for (let y = desk ? 320 : 15; y < (desk ? 410 : 110); y++) {
    let left = size, right = 0, count = 0;
    for (let x = 15; x < size - 15; x++) {
      const i = (y * size + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 220 && r > 80 && r < 230 && Math.max(r, g, b) - Math.min(r, g, b) < 24) { left = Math.min(left, x); right = Math.max(right, x); count++; }
    }
    if (count > best.count) best = { count, x: (left + right) / 2, y };
    scanlines.push({ count, y });
  }
  // The lowest broad grey scanline is the desk's front edge. The densest
  // scanline can jump between the desktop and fascia as the hand moves.
  if (desk) best.y = scanlines.filter(row => row.count >= best.count * 0.8).at(-1).y;
  if (best.count < 80) throw new Error('Could not locate the fixed rail/desk.');
  return best;
}
async function main() {
  await fs.mkdir(path.join(destination, 'frames'), { recursive: true });
  const meta = await sharp(source).metadata();
  if (!meta.hasAlpha) throw new Error('The sprite source must have a transparent alpha channel.');
  const buffers = [], rails = [];
  // The lunch source has wider inter-cell spacing drift. Center its desk in
  // the padded output canvas rather than inheriting the first cell's offset.
  let anchor = lunch ? { x: 250, y: 380 } : undefined;
  let sofaReference;
  for (let frame = 0; frame < 16; frame++) {
    const col = frame % 4, row = Math.floor(frame / 4);
    const left = Math.round(col * meta.width / 4), gridTop = Math.round(row * meta.height / 4);
    // The final lunch row starts slightly above the nominal quarter boundary.
    // Shift the extraction window into its transparent gutter to keep the tuft.
    const top = gridTop - (lunch && row === 3 ? 12 : 0);
    const width = Math.round((col + 1) * meta.width / 4) - left, height = Math.round((row + 1) * meta.height / 4) - gridTop;
    const tile = await sharp(source).extract({ left, top, width, height }).resize(size, size).ensureAlpha().raw().toBuffer();
    let dx = 0, dy = 0;
    if (after) {
      sofaReference ||= tile;
      ({ dx, dy } = sofaOffset(tile, sofaReference));
    } else if (!rest) {
      const point = railAnchor(tile);
      anchor ||= point;
      dx = Math.round(anchor.x - point.x); dy = Math.round(anchor.y - point.y);
    }
    const alignmentLimit = lunch || after ? 32 : 20;
    if (Math.abs(dx) > alignmentLimit || Math.abs(dy) > alignmentLimit) throw new Error('Unexpected sprite misalignment in frame ' + frame);
    const crop = await sharp(tile, { raw: { width: size, height: size, channels: 4 } }).extract({ left: Math.max(0, -dx), top: Math.max(0, -dy), width: size - Math.abs(dx), height: size - Math.abs(dy) }).png().toBuffer();
    const aligned = await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } }).composite([{ input: crop, left: Math.max(0, dx), top: Math.max(0, dy) }]).png().toBuffer();
    buffers.push(aligned); rails.push({ frame, dx, dy });
    await fs.writeFile(path.join(destination, 'frames', `${String(frame + 1).padStart(3, '0')}.png`), aligned);
  }
  await sharp({ create: { width: size * 4, height: size * 4, channels: 4, background: '#00000000' } }).composite(buffers.map((input, frame) => ({ input, left: frame % 4 * size, top: Math.floor(frame / 4) * size }))).png().toFile(path.join(destination, `${stem}-sheet-v2.png`));
  const raw = await Promise.all(buffers.map(buffer => sharp(buffer).ensureAlpha().raw().toBuffer()));
  async function exportAnimation(name, sequence) {
    const input = Buffer.concat(sequence.frames.map(frame => raw[frame]));
    const create = () => sharp(input, { raw: { width: size, height: size * sequence.frames.length, channels: 4, pageHeight: size } });
    await create().webp({ lossless: true, loop: 0, delay: sequence.delays, effort: 4 }).toFile(path.join(destination, name + '.webp'));
    await create().gif({ loop: 0, delay: sequence.delays, effort: 7, dither: 0 }).toFile(path.join(destination, name + '.gif'));
  }
  await exportAnimation('idle', idle);
  await exportAnimation(actionName, action);
  await exportAnimation(`${stem}-demo`, { frames: [...idle.frames, ...action.frames, 0], delays: [...idle.delays, ...action.delays, 700] });
  const manifest = { character: '月芽', state, version: 1, sheet: `assets/yueya/${state}/${stem}-sheet-v2.png`, columns: 4, rows: 4, frameSize: size, idle, action, randomInterval: [30000, 90000], anchorAlignment: rails, note: '16 unique generated keyframes; four idle poses and twelve action poses. Preview artwork.' };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const suffix = state === 'before' ? '' : '-' + state;
  const globalSuffix = state === 'before' ? '' : state[0].toUpperCase() + state.slice(1);
  await fs.writeFile(path.join(root, `prototype/yueya${suffix}-assets.js`), `/* Generated local animation manifest. */\nwindow.CFSYueya${globalSuffix}Assets = ` + JSON.stringify(manifest, null, 2) + ';\n');
  const summary = {};
  for (const file of ['idle.gif', actionName + '.gif', stem + '-demo.gif', stem + '-demo.webp']) { const m = await sharp(path.join(destination, file), { animated: true }).metadata(); summary[file] = { width: m.width, pageHeight: m.pageHeight, frames: m.pages, alpha: m.hasAlpha, duration: m.delay.reduce((a, b) => a + b, 0) }; }
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
