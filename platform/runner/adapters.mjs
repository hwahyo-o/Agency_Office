import { spawn } from 'node:child_process';

const TIMEOUT_MS = 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

function parseJsonOutput(output, adapter) {
  const trimmed = output.trim();
  if (!trimmed) throw new Error(adapter + ' CLI가 응답을 출력하지 않았습니다.');

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error(adapter + ' CLI JSON 응답을 읽을 수 없습니다.');
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new Error(adapter + ' CLI JSON 응답이 올바르지 않습니다.');
    }
  }
}

function buildCommand(adapter, sessionRef, prompt) {
  if (adapter === 'claude') {
    const args = ['-p', '--output-format', 'json', '--max-turns', '12'];
    if (sessionRef) args.push('--resume', sessionRef);
    args.push(prompt);
    return { command: 'claude', args };
  }

  if (adapter === 'gemini') {
    const args = ['--output-format', 'json'];
    if (sessionRef) args.push('--resume', sessionRef);
    args.push('--prompt', prompt);
    return { command: 'gemini', args };
  }

  throw new Error('지원하지 않는 CLI 어댑터입니다: ' + adapter);
}

function execute(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timeout;

    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
        child.kill();
        reject(new Error('CLI 응답이 허용 크기를 초과했습니다.'));
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error('CLI 실행 실패 (code ' + code + '): ' + stderr.trim().slice(-2000)));
        return;
      }
      resolve(stdout);
    });

    timeout = setTimeout(() => {
      child.kill();
      reject(new Error('CLI 작업이 60분 제한 시간을 넘었습니다.'));
    }, TIMEOUT_MS);
  });
}

export async function runCliAdapter(adapter, cwd, sessionRef, prompt) {
  const { command, args } = buildCommand(adapter, sessionRef, prompt);
  const output = await execute(command, args, cwd);
  const response = parseJsonOutput(output, adapter);
  const nextSessionRef = response.session_id ?? response.sessionId ?? sessionRef ?? null;
  const text = response.result ?? response.response ?? response.text;

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(adapter + ' CLI 응답에 결과 텍스트가 없습니다.');
  }
  if (!nextSessionRef) {
    throw new Error(adapter + ' CLI가 재개 가능한 세션 ID를 반환하지 않았습니다.');
  }

  return { text: text.trim(), sessionRef: String(nextSessionRef) };
}
