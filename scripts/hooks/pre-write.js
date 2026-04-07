let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    console.log(input);
    return;
  }

  const filePath = data.tool_input?.file_path || '';
  const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.yml', '.yaml', '.toml'];
  const ALLOWED_NAMES = ['README', 'CLAUDE', 'CONTRIBUTING', 'CHANGELOG', 'LICENSE', 'AGENTS', 'VERSION'];
  
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);
  
  if (ext && !ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
    if (!ALLOWED_NAMES.some(n => name.toUpperCase().startsWith(n))) {
      console.error('[Hook] Warning: Creating non-standard file type:', ext);
      console.error('[Hook] Allowed: .md, .txt, .json, .yml, .yaml, .toml');
    }
  }

  console.log(input);
});

const path = require('path');
