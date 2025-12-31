import { type ILogObj, Logger } from 'tslog';
import { clientConfig } from './config/client.js';

export const baseLogger: Logger<ILogObj> = new Logger<ILogObj>({
  name: 'shoginet',
  minLevel: levelToNumber(clientConfig.logger),
  prettyLogTemplate: '{{logLevelName}}: ({{hh}}:{{MM}}:{{ss}}) [{{name}}] ',
  prettyLogTimeZone: 'local',
  stylePrettyLogs: true,
  hideLogPositionForProduction: true,
});

function levelToNumber(level: string): number {
  const map: Record<string, number> = {
    debug: 2,
    info: 3,
    warn: 4,
    error: 5,
  };
  return map[level];
}
