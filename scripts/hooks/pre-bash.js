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
  const isDevServer = /npm\s+(run\s+)?dev|tsx\s+watch|nodemon/i.test(command);
  const isLongRunning = /npm\s+test|cargo\s+build|docker\s+build|pnpm\s+build/i.test(command);
  const isTmux = process.env.TERM?.includes('screen') || process.env.TMUX;

  if (isDevServer && !isTmux) {
    console.error('[Hook] BLOCKED: Dev server detected outside tmux/screen');
    console.error('[Hook] Run in tmux: tmux new -s dev && npm run dev');
    console.error('[Hook] Or use: npm run dev & (background)');
    process.exit(2);
  }

  if (isLongRunning && !isTmux) {
    console.error('[Hook] Consider running long command in tmux: tmux new -s build');
  }

  console.log(input);
});
