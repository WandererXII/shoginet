import { spawn } from 'node:child_process';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import config from 'config';
import { StatusCodes } from 'http-status-codes';
import serverConfig from './server-config.json' with { type: 'json' };
import { type WorkDefinition, works } from './works.js';

function main() {
  const worksInProgress = new Map<string, WorkDefinition>();

  const server = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const getNextWorkOrFinish = () => {
        const next = works.shift();
        if (!next) {
          console.log('All tests finished');
          process.exit(0);
        }

        console.log(`Started work: ${next.name}`);
        worksInProgress.set(next.path, next);
        return next;
      };

      switch (req.url) {
        case '/shoginet/config': {
          res.writeHead(StatusCodes.OK, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(serverConfig));
        }
        case '/shoginet/acquire': {
          const next = getNextWorkOrFinish();

          res.writeHead(StatusCodes.ACCEPTED, {
            'Content-Type': 'application/json',
          });
          return res.end(JSON.stringify(next.work));
        }
        default: {
          const curWork = req.url && worksInProgress.get(req.url);
          if (!curWork) {
            console.error(`✖ No work in progress`);
            process.exit(1);
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
              else console.error(`✖ ${curWork.name} failed`);

              const next = getNextWorkOrFinish();
              res.writeHead(StatusCodes.ACCEPTED, {
                'Content-Type': 'application/json',
              });
              return res.end(JSON.stringify(next.work));
            } else {
              res.writeHead(StatusCodes.NO_CONTENT, {
                'Content-Type': 'application/json',
              });
              return res.end();
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

  const shoginetProcess = spawn('tsx', ['src/main.ts'], {
    env: {
      ...process.env,
    },
  });

  shoginetProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  shoginetProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  shoginetProcess.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main();
