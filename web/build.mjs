import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
for(const name of ['index.html','player.css','player.js','icon.svg','manifest.webmanifest']) {
  copyFileSync(fileURLToPath(new URL(name,import.meta.url)),fileURLToPath(new URL('../worker/public/'+name,import.meta.url)));
}
console.log('Web player copied to worker/public; existing Songloft files preserved.');
