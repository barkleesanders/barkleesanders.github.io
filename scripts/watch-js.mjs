import { spawn } from 'node:child_process';
import { watch } from 'chokidar';

let running = false;
let pending = false;
let timer;
function build() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  const child = spawn('npm', ['run', 'build:js'], { stdio: 'inherit' });
  child.on('error', error => {
    console.error(error);
    process.exit(1);
  });
  child.on('exit', code => {
    running = false;
    if (code !== 0) console.error(`JavaScript build failed (${code}).`);
    if (pending) {
      pending = false;
      build();
    }
  });
}
watch('assets/js', { ignoreInitial: true }).on('all', (_event, path) => {
  if (!path.endsWith('.js') || path.endsWith('/main.min.js')) return;
  clearTimeout(timer);
  timer = setTimeout(build, 100);
});
