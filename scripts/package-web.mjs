import {execFileSync} from 'node:child_process';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('release',{recursive:true});
execFileSync('ditto',['-c','-k','--keepParent','dist','release/VELORA-web.zip']);
console.log('release/VELORA-web.zip — HTTPS 정적 호스팅에 dist의 내용을 배포하세요.');
