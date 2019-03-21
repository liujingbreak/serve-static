import serveStatic from './index';
import fs from 'fs';

export function test(file: string) {
	serveStatic().updateZip(fs.readFileSync(file));
}

test('/Users/liujing/Documents/el-screen-shot.zip');
