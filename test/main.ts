import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import config from 'config';
import { StatusCodes } from 'http-status-codes';
import { type WorkDefinition, works } from './works.js';

function main() {
  let shoginetProcess: ChildProcessWithoutNullStreams;
  let exitCode: number = 0;
  let running = true;

  const worksInProgress = new Map<string, WorkDefinition>();

  const server = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const noWork = () => {
        res.writeHead(StatusCodes.NO_CONTENT, {
          'Content-Type': 'application/json',
        });
        return res.end();
      };

      const getNextWork = () => {
        if (!running) return noWork();

        const next = works.shift();
        if (!next) {
          console.log('All tests finished');
          running = false;
          startShutdown();
          return noWork();
        } else {
          console.log(`Started work: ${next.name}`);
          worksInProgress.set(next.path, next);
          res.writeHead(StatusCodes.ACCEPTED, {
            'Content-Type': 'application/json',
          });
          return res.end(JSON.stringify(next.work));
        }
      };

      switch (req.url) {
        case '/assets/shoginet/config.json': {
          // make sure shoginet can start on server downtime
          res.writeHead(StatusCodes.INTERNAL_SERVER_ERROR, {
            'Content-Type': 'application/json',
          });
          return res.end();
        }
        case '/shoginet/acquire': {
          return getNextWork();
        }
        default: {
          const curWork = req.url && worksInProgress.get(req.url);
          if (!curWork) {
            console.error(`✖ No work in progress`);
            exitCode += 1;
            startShutdown();
            res.writeHead(StatusCodes.INTERNAL_SERVER_ERROR);
            return res.end();
          }
          try {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c);
            const body = chunks.length
              ? JSON.parse(Buffer.concat(chunks).toString())
              : {};

            const validated = curWork.validate(body);
            // allow undefined for progress reports
            if (validated !== undefined) {
              if (validated) console.log(`✔ ${curWork.name} passed validation`);
              else {
                console.error(`✖ ${curWork.name} failed`);
                exitCode += 1;
              }

              return getNextWork();
            } else {
              return noWork();
            }
          } catch (e) {
            res.writeHead(StatusCodes.INTERNAL_SERVER_ERROR);
            return res.end(JSON.stringify({ error: (e as Error).message }));
          }
        }
      }
    },
  );

  const url = new URL(config.get('endpoint'));
  server.listen(url.port, () => {
    console.log(`Mock server running at ${url.href}`);
  });

  shoginetProcess = spawn('tsx', ['src/main.ts'], {
    env: {
      ...process.env,
    },
  });

  shoginetProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  shoginetProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  shoginetProcess.on('exit', () => {
    server.close(() => {
      console.log(`Exiting with code: ${exitCode}`);
      process.exit(exitCode);
    });
  });

  function startShutdown() {
    shoginetProcess.kill('SIGTERM');
  }
}

main();
