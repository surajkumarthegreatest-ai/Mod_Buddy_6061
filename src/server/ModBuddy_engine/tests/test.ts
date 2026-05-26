import { processQueueItem } from '../main';
import {open} from 'node:fs/promises';

async function test() {
  const fileHandle1 = await open('./test_input_1.json', 'r');
  const fileHandle2 = await open('./test_output_1.json', 'w');
  const fileContent = await fileHandle1.readFile({ encoding: 'utf-8' });
  const testInput = JSON.parse(fileContent);
  var output = [];
  for (const item of testInput) {
    const result = await processQueueItem(item);
    output.push(result);
  }
  await fileHandle2.writeFile(JSON.stringify(output, null, 2), { encoding: 'utf-8' });
  await fileHandle1.close();
  await fileHandle2.close();
  
}
test();