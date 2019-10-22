var fs = require('fs');

var block = [];
for(var i = 0; i < 505; i++) {
  block.push(`${i}\n`)
}

fs.writeFileSync('./test_505.txt', block.join('\n'));
