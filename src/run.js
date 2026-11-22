import { spawn } from 'node:child_process';

/**
 * Runs a program without a shell, writes `input` to its stdin and waits for it to end.
 * Resolves `{ code, stderr }`; rejects with `error.code === 'ENOENT'` when the program is not installed.
 */
export function run(command, args = [], { input, env, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
        env: env ? { ...process.env, ...env } : process.env,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr: stderr.trim() });
    });
    child.stdin.on('error', () => {}); // a program that exits early closes its stdin
    child.stdin.end(input ?? '');
  });
}

/** Runs a program and captures stdout (for listing voices). */
export function capture(command, args = [], { timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }
    let out = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}
