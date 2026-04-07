let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  console.error('[Stop] Session summary: Tool calls this turn completed');
  console.log(input);
});
