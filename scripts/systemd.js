import { execSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path'; 

function systemdConfig() {
  const cwd = process.cwd();
  const user = execSync('whoami').toString().trim();
  const group = execSync('id -gn').toString().trim();

  const nodePath = process.execPath;
  const tsxPath = path.join(cwd, 'node_modules', '.bin', 'tsx');
  const nodeBinDir = path.dirname(nodePath);
  const envPath = `PATH=${nodeBinDir}:/usr/bin:/bin`;

  const output = `[Unit]
After=network-online.target
Wants=network-online.target

[Service]
Environment="${envPath}"
# ExecStart=${nodePath} ${tsxPath} ./test/main.ts
ExecStart=${nodePath} ${tsxPath} ./src/main.ts

WorkingDirectory=${cwd}
ReadWriteDirectories=${cwd}
User=${user}
Group=${group}
Nice=5
CapabilityBoundingSet=
PrivateTmp=true
PrivateDevices=true
DevicePolicy=closed
ProtectSystem=strict
NoNewPrivileges=true
Restart=on-failure
RestartSec=5
TimeoutStopSec=610
KillSignal=SIGINT
KillMode=process
SendSIGKILL=yes
FinalKillSignal=SIGKILL

[Install]
WantedBy=multi-user.target
`;

  console.log(output);
}

systemdConfig();
