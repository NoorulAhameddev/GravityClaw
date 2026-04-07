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
  const newString = data.tool_input?.new_string || '';
  
  if (/\.(ts|js)$/.test(filePath)) {
    if (/console\.(log|debug|info)/.test(newString)) {
      console.error('[Hook] Warning: console.log detected - remove before commit');
    }
    
    if (/TODO|FIXME|HACK/.test(newString)) {
      console.error('[Hook] TODO/FIXME comment added - create issue if needed');
    }
  }

  console.log(input);
});
