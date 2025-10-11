import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { cwd } from 'node:process';
import * as readline from 'node:readline';
import type { Rules } from 'shogiops/types';
import { clientConfig } from './config/client.js';
import type { EngineInfo, EngineKind } from './types.js';
import type { Worker } from './worker.js';

const options: Record<EngineKind, Record<string, string | number | boolean>> = {
  yaneuraou: {
    Threads: clientConfig.engines.yaneuraou.threads,
    USI_Hash: clientConfig.engines.yaneuraou.memory,
    EnteringKingRule: 'CSARule27H',
    EvalDir: path.join(cwd(), 'eval'),
    BookFile: 'no_book',
    ConsiderationMode: 'true',
    OutputFailLHPV: 'true',
  },
  fairy: {
    Threads: clientConfig.engines.fairy.threads,
    USI_Hash: clientConfig.engines.fairy.memory,
  },
};

export interface EngineEvents {
  usiok: () => void;
  readyok: () => void;
  info: (args: string) => void;
  bestmove: (usi: string) => void;
  failure: () => void;
}

export declare interface Engine {
  on<U extends keyof EngineEvents>(event: U, listener: EngineEvents[U]): this;
  off<U extends keyof EngineEvents>(event: U, listener: EngineEvents[U]): this;
  once<U extends keyof EngineEvents>(event: U, listener: EngineEvents[U]): this;
  emit<U extends keyof EngineEvents>(
    event: U,
    ...args: Parameters<EngineEvents[U]>
  ): boolean;
}

export class Engine extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | undefined;

  private stdoutInterface: readline.Interface | undefined;
  private stderrInterface: readline.Interface | undefined;

  private logger: Worker['logger'];

  private isDestroyed = false;
  public isActive = false;
  public info: EngineInfo = {};

  private history: string[] = [];

  constructor(
    worker: Worker,
    public readonly kind: EngineKind,
  ) {
    super();

    this.logger = worker.logger.getSubLogger({
      name: `${this.kind}`,
    });

    const command =
      this.kind === 'fairy'
        ? clientConfig.engines.fairy.path
        : clientConfig.engines.yaneuraou.path;

    this.process = spawn(command);

    this.process.on('error', (err) => {
      this.logger.error(`Engine couldn't start: ${err}`);
    });

    this.process.on('exit', (code, signal) => {
      this.isActive = false;

      if (code)
        this.logger.info(`Engine exited with code ${code}, signal ${signal}`);
      else {
        this.logger.error(
          `Engine failure, signal ${signal}, history:`,
          this.history,
        );
        this.emit('failure');
      }
    });

    this.stdoutInterface = readline.createInterface({
      input: this.process.stdout,
    });
    this.stdoutInterface.on('line', (line) => {
      if (!line) return;

      this.logger.silly(`>> ${line}`);

      const index = line.indexOf(' ');
      const [cmd, rest] =
        index === -1
          ? [line, '']
          : [line.slice(0, index), line.slice(index + 1)];

      if (cmd === 'usiok') this.emit('usiok');
      else if (cmd === 'readyok') this.emit('readyok');
      else if (cmd === 'info') this.emit('info', rest);
      else if (cmd === 'bestmove') this.emit('bestmove', rest.split(/\s+/)[0]);
      else if (cmd === 'id') {
        const parts = rest.split(/\s+/);
        if (parts.length >= 2) this.info[parts[0]] = parts.slice(1).join(' ');
      } else if (cmd === 'option') {
        this.info.options = this.info.options || [];
        this.info.options.push(rest.split(' ')[1]);
      }
    });

    this.stderrInterface = readline.createInterface({
      input: this.process.stderr,
    });
    this.stderrInterface.on('line', (line) => {
      this.logger.error(`stderr: ${line}`);
    });

    this.once('usiok', () => {
      this.logger.debug('id:', this.info);
      for (const [name, value] of Object.entries(options[this.kind])) {
        this.setOption(name, value);
      }
      this.once('readyok', () => {
        this.isActive = true;
      });
      this.send('isready');
    });
    this.send('usi');
  }

  destroy(): void {
    if (!this.process || this.isDestroyed) return;

    const process = this.process;

    this.isDestroyed = true;
    this.isActive = false;
    this.process = undefined;
    this.info = {};

    this.removeAllListeners();
    this.stdoutInterface?.removeAllListeners();
    this.stderrInterface?.removeAllListeners();
    process.removeAllListeners();

    process.stdin.end();
    this.stdoutInterface?.close();
    this.stderrInterface?.close();

    const forceKillTimeout = setTimeout(() => {
      if (!process.killed) {
        this.logger.debug('Sending SIGKILL');
        process.kill('SIGKILL');
      }
    }, 500);
    process.once('exit', () => {
      this.logger.info('Engined exited successfully');
      clearTimeout(forceKillTimeout);
    });
    this.logger.debug('Sending SIGTERM');
    process.kill('SIGTERM');
  }

  send(line: string): void {
    this.logger.debug(`<< ${line}`);

    if (!this.process) this.logger.error(`No process to send line: ${line}`);
    else {
      this.history.push(line);
      if (this.history.length > 10) this.history.shift();
      this.process.stdin.write(`${line}\n`, (err) => {
        if (err) this.logger.error(`Engine write error: ${err.message}`);
      });
    }
  }

  setOption(name: string, value: string | number | boolean | null): void {
    if (!this.info.options?.includes(name))
      this.logger.warn(`Setting unknown option: name ${name} value ${value}`);

    let valueStr: string;

    if (value === true) valueStr = 'true';
    else if (value === false) valueStr = 'false';
    else if (value === null) valueStr = 'none';
    else valueStr = String(value);

    this.send(`setoption name ${name} value ${valueStr}`);
  }

  setVariant(variant: Rules): void {
    if (this.kind === 'fairy')
      this.setOption('USI_Variant', variant === 'standard' ? 'shogi' : variant);
  }

  setMultiPv(pv: number): void {
    if (this.kind === 'fairy') this.setOption('USI_MultiPV', pv);
    else this.setOption('MultiPV', pv);
  }

  search(
    position: string,
    moves: string[],
    options?: {
      movetime: number | undefined;
      depth: number | undefined;
      nodes: number | undefined;
      clock:
        | { btime: number; wtime: number; byo: number; inc: number }
        | undefined;
    },
  ): void {
    this.once('readyok', () => {
      this.send(`position sfen ${position} moves ${moves.join(' ')}`);

      const builder = ['go'];

      if (options?.movetime !== undefined)
        builder.push('movetime', String(options.movetime));
      if (options?.depth !== undefined)
        builder.push('depth', String(options.depth));
      if (options?.nodes !== undefined)
        builder.push('nodes', String(options.nodes));

      if (options?.clock) {
        builder.push(
          'btime',
          String(options.clock.btime * 10),
          'wtime',
          String(options.clock.wtime * 10),
          'byoyomi',
          String(options.clock.byo * 1000),
        );

        if (options.clock.inc) {
          builder.push('binc', String(options.clock.inc * 1000));
          builder.push('winc', String(options.clock.inc * 1000));
        }
      }

      this.send(builder.join(' '));
    });
    this.send('isready');
  }
}
