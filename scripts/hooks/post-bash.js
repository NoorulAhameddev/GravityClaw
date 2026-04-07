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

  const command = data.tool_input?.command || '';
  const output = data.tool_output?.output || '';
  
  const isBuildCommand = /npm\s+run\s+(build|typecheck)|tsc|pnpm\s+build/i.test(command);
  
  if (isBuildCommand) {
    const hasErrors = /error\s+TS\d+:|ERROR:|failed/i.test(output);
    const hasWarnings = /warning\s+TS\d+:|warn/i.test(output);
    
    if (hasErrors) {
      console.error('[Hook] Build completed with errors');
    } else if (hasWarnings) {
      console.error('[Hook] Build completed with warnings');
    } else {
      console.error('[Hook] Build completed successfully');
    }
  }

  console.log(input);
});
