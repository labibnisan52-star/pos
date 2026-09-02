const fs = require('fs');
let code = fs.readFileSync('public/niimbluelib.min.js', 'utf8');

// Replace Node.js requires
code = code.replace(/require\(['"]os['"]\)/g, '{}');
code = code.replace(/require\(['"]fs['"]\)/g, '{}');
code = code.replace(/require\(['"]path['"]\)/g, '{}');
code = code.replace(/require\(['"]crypto['"]\)/g, '{}');
code = code.replace(/require\(['"]child_process['"]\)/g, '{}');
code = code.replace(/require\(['"]@stoprocent\/bluetooth-hci-socket['"]\)/g, '{}');

// Force window export by replacing the UMD header
// Find: typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
code = code.replace(
  /typeof exports === ['"]object['"] && typeof module !== ['"]undefined['"] \? factory\(exports\) :/g,
  'false ? factory(exports) :'
);

// Find: typeof define === 'function' && define.amd ? define(['exports'], factory) :
code = code.replace(
  /typeof define === ['"]function['"] && define\.amd \? define\(\[['"]exports['"]\], factory\) :/g,
  'false ? define(["exports"], factory) :'
);

fs.writeFileSync('public/niimbluelib.min.js', code);
console.log("Patched successfully!");
